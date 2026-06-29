"""Per-channel go-live requirements (your add-on table) as data.

A channel can only go LIVE when its tenant config has `enabled=True` AND every
requirement here is satisfied. Each requirement is a small predicate over the
non-secret `settings` + the `credentials_present` booleans on the config — we
never look at secret values here.

Wave 1 keeps these as a central data registry so the whole layer (and the UI's
"what's needed" list) works today. Wave 2 moves each channel's specifics INTO its
own adapter (the adapter calls back into these helpers), keeping isolation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .schemas import Channel, ChannelConfig, Requirement, SupportLevel


@dataclass(frozen=True)
class ReqSpec:
    key: str
    label: str
    hint: str
    check: Callable[[ChannelConfig], bool]


def _has_cred(*keys: str) -> Callable[[ChannelConfig], bool]:
    return lambda c: all(c.credentials_present.get(k) for k in keys)


def _has_setting(*keys: str) -> Callable[[ChannelConfig], bool]:
    return lambda c: all(bool(c.settings.get(k)) for k in keys)


def _both(*fns: Callable[[ChannelConfig], bool]) -> Callable[[ChannelConfig], bool]:
    return lambda c: all(fn(c) for fn in fns)


# Default support level per channel (what's realistically wired today).
SUPPORT_LEVEL: dict[Channel, SupportLevel] = {
    Channel.WEB_CHAT: SupportLevel.FULL_API,           # works fully, no external creds
    Channel.TELEGRAM: SupportLevel.FULL_API,           # simple token-based Bot API
    Channel.WHATSAPP: SupportLevel.PARTIAL_API,        # behind flag, template/window rules
    Channel.SMS: SupportLevel.PARTIAL_API,
    Channel.EMAIL: SupportLevel.PARTIAL_API,
    Channel.INSTAGRAM_DM: SupportLevel.FUTURE_PLACEHOLDER,
    Channel.FACEBOOK_MESSENGER: SupportLevel.FUTURE_PLACEHOLDER,
    Channel.VOICE: SupportLevel.FUTURE_PLACEHOLDER,
    Channel.GENERIC_WEBHOOK: SupportLevel.PARTIAL_API,
}


# Per-channel specific requirements (isolated, easy to extend).
REQUIREMENT_SPECS: dict[Channel, list[ReqSpec]] = {
    Channel.WEB_CHAT: [
        ReqSpec("widget", "Site/widget connected", "Embed the Pixie chat widget or call the chat API.",
                _has_setting("widget_id")),
    ],
    Channel.SMS: [
        ReqSpec("phone_number", "Sending phone number", "Add the phone number SMS will send from.",
                _has_setting("phone_number")),
        ReqSpec("provider_creds", "SMS provider credentials", "Add Twilio/Sinch account SID + auth token.",
                _has_cred("account_sid", "auth_token")),
        ReqSpec("a2p", "A2P 10DLC registration (US)", "Register the brand/campaign for US A2P traffic.",
                _has_setting("a2p_registered")),
        ReqSpec("opt_out", "Opt-out handling", "STOP/UNSUBSCRIBE handling enabled.",
                _has_setting("opt_out_enabled")),
    ],
    Channel.WHATSAPP: [
        ReqSpec("business_account", "Meta Business + WhatsApp number id", "Connect Meta Business and the WhatsApp phone number id.",
                _both(_has_setting("waba_id", "phone_number_id"), _has_cred("access_token"))),
        ReqSpec("templates", "Approved message templates", "At least one approved template for proactive sends.",
                _has_setting("approved_templates")),
        ReqSpec("window_rules", "24-hour window rule acknowledged", "Proactive sends outside 24h must use a template.",
                _has_setting("window_rules_ack")),
        ReqSpec("compliance_flag", "Compliance flag (gated)", "Channel kept behind a feature flag until compliance-approved.",
                _has_setting("compliance_approved")),
    ],
    Channel.EMAIL: [
        ReqSpec("from_address", "From-address", "Set the address email sends from.",
                _has_setting("from_address")),
        ReqSpec("provider_creds", "Email provider credentials", "Add Postmark/SES API credentials.",
                _has_cred("api_key")),
        ReqSpec("verified_domain", "Verified sender domain", "Verify the sender domain (SPF/DKIM).",
                _has_setting("domain_verified")),
        ReqSpec("unsubscribe", "Unsubscribe footer", "Include an unsubscribe footer in marketing email.",
                _has_setting("unsubscribe_footer")),
    ],
    Channel.TELEGRAM: [
        ReqSpec("bot_token", "Bot token", "Create a bot via @BotFather and add its token.",
                _has_cred("bot_token")),
    ],
    Channel.INSTAGRAM_DM: [
        ReqSpec("oauth", "Platform app + OAuth token", "Connect the Meta app and authorize Instagram messaging.",
                _has_cred("access_token")),
        ReqSpec("permission", "Messaging permission/approval", "App-review approval for instagram_manage_messages.",
                _has_setting("messaging_approved")),
    ],
    Channel.FACEBOOK_MESSENGER: [
        ReqSpec("oauth", "Platform app + Page token", "Connect the Meta app and the Facebook Page.",
                _has_cred("page_access_token")),
        ReqSpec("permission", "Messaging permission/approval", "App-review approval for pages_messaging.",
                _has_setting("messaging_approved")),
    ],
    Channel.VOICE: [
        ReqSpec("phone_number", "Voice phone number", "Add the number that places/receives calls.",
                _has_setting("phone_number")),
        ReqSpec("provider", "Voice provider", "Add the voice provider (e.g. Twilio Voice) credentials.",
                _has_cred("account_sid", "auth_token")),
        ReqSpec("stt_tts", "STT/TTS configured", "Speech-to-text + text-to-speech engines configured.",
                _has_setting("stt_engine", "tts_engine")),
    ],
    Channel.GENERIC_WEBHOOK: [
        ReqSpec("endpoint", "Outbound endpoint URL", "Set the URL Pixie POSTs outbound messages to.",
                _has_setting("endpoint_url")),
    ],
}


def support_level_for(channel: Channel) -> SupportLevel:
    return SUPPORT_LEVEL.get(channel, SupportLevel.FUTURE_PLACEHOLDER)


def evaluate_requirements(config: ChannelConfig) -> tuple[list[Requirement], list[str], bool]:
    """Evaluate a channel's requirements against its config.

    Returns (requirements, missing_labels, all_met). With no specs (shouldn't
    happen) a channel is trivially met."""
    specs = REQUIREMENT_SPECS.get(config.channel, [])
    reqs: list[Requirement] = []
    missing: list[str] = []
    for s in specs:
        met = bool(s.check(config))
        reqs.append(Requirement(key=s.key, label=s.label, met=met, hint=s.hint))
        if not met:
            missing.append(s.label)
    return reqs, missing, (len(missing) == 0)
