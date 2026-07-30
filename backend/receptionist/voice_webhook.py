"""Vapi server-events webhook for the AI Receptionist (Parts 4/7).

ONE authenticated endpoint for all Vapi server messages. Authentication uses the
per-workspace server secret (separate from the Vapi API key), constant-time; the
workspace is resolved SERVER-SIDE from the verified phone-number id/number, never
the payload. Every event is deduplicated by a deterministic key. ``assistant-request``
and ``tool-calls`` respond synchronously (Vapi consumes the response); other events
enqueue durable jobs. Transcript content is never written to ordinary logs.
"""

from __future__ import annotations

import hmac
import json
import logging

from fastapi import APIRouter, Request, Response

log = logging.getLogger("pixie.receptionist.voice_webhook")

voice_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-voice-webhook"])


def _max_bytes() -> int:
    from receptionist.providers.voice_adapter import max_event_bytes
    return max_event_bytes()


def _server_secret(tenant_id: str) -> str:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "voice_read") \
        or find_active_connection_unsealed(tenant_id, "voice_send")
    return (conn or {}).get("server_secret", "") if conn else ""


def _resolve_tenant(message: dict):
    from integrations import connections
    call = message.get("call") or {}
    pn_id = call.get("phoneNumberId") or message.get("phoneNumberId") or ""
    number = ((call.get("phoneNumber") or {}).get("number")
              or (message.get("phoneNumber") or {}).get("number") or "")
    for candidate in (pn_id, number):
        if candidate:
            t = connections.find_tenant_by_voice_number(str(candidate))
            if t is not None:
                return t
    return None


@voice_webhook_router.post("/voice/webhook")
async def voice_events(request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _max_bytes():
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")
    try:
        body = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        return Response(status_code=400, content='{"error":"malformed"}', media_type="application/json")

    message = body.get("message") or body
    tenant_id = _resolve_tenant(message)
    if tenant_id is None:
        # unknown number → never creates a workspace
        return Response(status_code=200, content='{"skipped":"unknown_number"}', media_type="application/json")

    from integrations import connections
    conn = connections.find_active_connection(tenant_id, "voice_read")
    if conn is None or conn.get("status") == "disconnected":
        return Response(status_code=200, content='{"skipped":"disabled"}', media_type="application/json")

    secret = _server_secret(tenant_id)
    provided = request.headers.get("x-vapi-secret", "") or _bearer(request.headers.get("authorization", ""))
    if not (secret and hmac.compare_digest(secret, provided)):
        return Response(status_code=403, content='{"error":"bad_secret"}', media_type="application/json")

    etype = message.get("type", "")
    call_id = (message.get("call") or {}).get("id", "") or message.get("callId", "")

    # synchronous events
    if etype == "assistant-request":
        return _assistant_request(tenant_id, message, call_id)
    if etype in ("tool-calls", "function-call"):
        return _tool_calls(tenant_id, message, call_id)
    if etype == "transfer-destination-request":
        return _transfer_destination(tenant_id, message)

    # informational events → dedup + enqueue
    return _enqueue_event(tenant_id, etype, call_id, message)


def _bearer(header: str) -> str:
    return header[len("Bearer "):] if header.startswith("Bearer ") else ""


def _dedup_key(etype: str, call_id: str, message: dict) -> str:
    if etype == "transcript":
        t = message.get("transcript") or {}
        return f"{call_id}:transcript:{t.get('role','')}:{message.get('transcriptType','')}:{t.get('transcript','')[:32]}"
    if etype == "end-of-call-report":
        return f"{call_id}:end-report"
    if etype == "status-update":
        return f"{call_id}:status:{message.get('status','')}"
    return f"{call_id}:{etype}:{message.get('timestamp','')}"


def _enqueue_event(tenant_id: str, etype: str, call_id: str, message: dict) -> Response:
    from integrations import webhook_events
    from receptionist.worker import jobs_store
    key = _dedup_key(etype, call_id, message)
    if webhook_events.already_seen("voice", key):
        return Response(status_code=200, content='{"deduped":true}', media_type="application/json")
    job = {
        "status-update": "voice_event_process", "transcript": "voice_transcript_process",
        "conversation-update": "voice_event_process", "speech-update": "voice_event_process",
        "transfer-update": "voice_transfer", "end-of-call-report": "voice_end_report_process",
        "hang": "voice_event_process",
    }.get(etype)
    if job is None:
        return Response(status_code=200, content='{"ignored":"unsupported_event"}', media_type="application/json")
    try:
        jobs_store.enqueue(tenant_id, job, {"call_id": call_id, "event_type": etype, "message": message})
        webhook_events.mark_seen("voice", key)
    except Exception as exc:
        log.warning("voice enqueue failed: %s", type(exc).__name__)
        return Response(status_code=200, content='{"enqueue":"deferred"}', media_type="application/json")
    return Response(status_code=200, content='{"enqueued":true}', media_type="application/json")


def _assistant_request(tenant_id: str, message: dict, call_id: str) -> Response:
    from receptionist.service import voice_assistant, voice_sessions, voice_policy
    if not voice_policy.inbound_enabled(tenant_id):
        return Response(status_code=200, content=json.dumps({"error": "inbound_disabled"}), media_type="application/json")
    call = message.get("call") or {}
    caller = (call.get("customer") or {}).get("number", "") or (message.get("customer") or {}).get("number", "")
    if call_id:
        voice_sessions.create_session(tenant_id, call_id=call_id, direction="inbound",
                                      caller_number=caller, phone_number_id=call.get("phoneNumberId", ""),
                                      status="ringing")
    config = voice_assistant.build_assistant_config(tenant_id, caller_number=caller)
    return Response(status_code=200, content=json.dumps({"assistant": config}), media_type="application/json")


def _tool_calls(tenant_id: str, message: dict, call_id: str) -> Response:
    from receptionist.service import voice_sessions
    calls = message.get("toolCalls") or message.get("toolCallList") or []
    if not calls and message.get("functionCall"):
        fc = message["functionCall"]
        calls = [{"id": message.get("id", "fc"), "function": {"name": fc.get("name", ""), "arguments": fc.get("parameters", {})}}]
    results = []
    for c in calls:
        fn = c.get("function") or {}
        args = fn.get("arguments", {})
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except (ValueError, TypeError):
                args = {}
        out = voice_sessions.process_tool_call(tenant_id, call_id, tool_call_id=c.get("id", ""),
                                               tool_name=fn.get("name", ""), arguments=args)
        res = out.get("result", {})
        results.append({"toolCallId": c.get("id", ""), "result": res.get("speech", "") or "Done."})
    return Response(status_code=200, content=json.dumps({"results": results}), media_type="application/json")


def _transfer_destination(tenant_id: str, message: dict) -> Response:
    from receptionist.service import voice_policy
    dest = voice_policy.resolve_transfer_destination(tenant_id, str((message.get("department") or "")))
    if dest is None:
        return Response(status_code=200, content=json.dumps({"error": "no_destination"}), media_type="application/json")
    # server-resolved destination; the model never supplies the number
    return Response(status_code=200,
                   content=json.dumps({"destination": {"type": "number", "number": dest.get("number", "")}}),
                   media_type="application/json")
