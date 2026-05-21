<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" version="5.0" encoding="UTF-8" indent="yes"
    doctype-system="about:legacy-compat" />
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, follow" />
        <title>Pixie — XML Sitemap</title>
        <link rel="icon" type="image/png" href="/pixie-logo.png" />
        <style>
          * { box-sizing: border-box; }
          html { -webkit-font-smoothing: antialiased; }
          body {
            margin: 0;
            font-family: 'Inter', system-ui, -apple-system, Segoe UI, sans-serif;
            color: #0F172A;
            background: #F6F8FB;
            line-height: 1.5;
          }
          .header {
            background: linear-gradient(135deg, #0A1628 0%, #13335A 100%);
            color: white;
            padding: 56px 24px 64px;
            position: relative;
            overflow: hidden;
          }
          .header::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 80% 30%, rgba(37, 211, 102, 0.18), transparent 55%);
            pointer-events: none;
          }
          .header-inner {
            max-width: 1100px;
            margin: 0 auto;
            position: relative;
            z-index: 1;
          }
          .brand-row {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 6px 14px;
            background: rgba(37, 211, 102, 0.12);
            border: 1px solid rgba(37, 211, 102, 0.35);
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #25D366;
            margin-bottom: 18px;
          }
          .brand-dot {
            width: 8px;
            height: 8px;
            background: #25D366;
            border-radius: 50%;
          }
          h1 {
            font-size: 36px;
            font-weight: 800;
            margin: 0 0 12px;
            letter-spacing: -0.02em;
            line-height: 1.1;
          }
          .header p {
            font-size: 15px;
            max-width: 700px;
            margin: 0 0 16px;
            color: rgba(255, 255, 255, 0.78);
          }
          .header a {
            color: #25D366;
            text-decoration: underline;
            text-underline-offset: 3px;
            font-weight: 600;
          }
          .container {
            max-width: 1100px;
            margin: -32px auto 0;
            padding: 0 24px 48px;
            position: relative;
          }
          .count {
            background: white;
            border: 1px solid #E5E9F0;
            border-radius: 16px;
            padding: 18px 22px;
            font-size: 14px;
            color: #475569;
            box-shadow: 0 4px 20px -8px rgba(15, 23, 42, 0.08);
            margin-bottom: 20px;
          }
          .count strong {
            color: #0F172A;
            font-weight: 700;
          }
          .table-wrapper {
            background: white;
            border: 1px solid #E5E9F0;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 20px -8px rgba(15, 23, 42, 0.08);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th {
            background: #F6F8FB;
            text-align: left;
            font-weight: 700;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748B;
            padding: 14px 20px;
            border-bottom: 1px solid #E5E9F0;
          }
          td {
            padding: 14px 20px;
            border-bottom: 1px solid #F1F4F9;
            color: #1F2937;
            vertical-align: middle;
          }
          tr:last-child td {
            border-bottom: none;
          }
          tr:hover td {
            background: #FBFCFE;
          }
          a.url-link {
            color: #128C7E;
            text-decoration: none;
            font-weight: 600;
            word-break: break-all;
          }
          a.url-link:hover {
            color: #0A1628;
            text-decoration: underline;
          }
          .meta {
            font-size: 12.5px;
            color: #64748B;
            white-space: nowrap;
          }
          .pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: white;
          }
          .pill-p-high { background: #16A34A; }
          .pill-p-mid { background: #2563EB; }
          .pill-p-low { background: #94A3B8; }
          .freq {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 10px;
            border-radius: 999px;
            background: #F1F4F9;
            color: #475569;
            font-size: 12px;
            font-weight: 600;
            text-transform: capitalize;
          }
          footer {
            max-width: 1100px;
            margin: 0 auto;
            padding: 28px 24px 48px;
            text-align: center;
            color: #94A3B8;
            font-size: 13px;
          }
          footer a {
            color: #475569;
            text-decoration: none;
            font-weight: 600;
          }
          footer a:hover {
            color: #0F172A;
            text-decoration: underline;
          }
          @media (max-width: 640px) {
            .header { padding: 40px 18px 56px; }
            h1 { font-size: 28px; }
            .container { padding: 0 18px 32px; }
            th, td { padding: 12px 14px; }
            .col-meta { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-inner">
            <div class="brand-row">
              <span class="brand-dot"></span>
              Pixie
            </div>
            <h1>XML Sitemap</h1>
            <p>
              This XML Sitemap is generated by Pixie. It is what search engines like Google use to crawl and re-crawl pages, tools, and content on pixiebot.co.
            </p>
            <a href="https://www.sitemaps.org/protocol.html" target="_blank" rel="noopener">Learn more about XML Sitemaps.</a>
          </div>
        </div>

        <div class="container">
          <div class="count">
            This XML Sitemap contains <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)" /></strong> URLs.
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>URL</th>
                  <th class="col-meta">Last Modified</th>
                  <th class="col-meta">Change Frequency</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:urlset/sitemap:url">
                  <tr>
                    <td>
                      <a class="url-link" target="_blank" rel="noopener">
                        <xsl:attribute name="href">
                          <xsl:value-of select="sitemap:loc" />
                        </xsl:attribute>
                        <xsl:value-of select="sitemap:loc" />
                      </a>
                    </td>
                    <td class="col-meta meta">
                      <xsl:value-of select="substring(sitemap:lastmod, 1, 10)" />
                    </td>
                    <td class="col-meta">
                      <span class="freq">
                        <xsl:value-of select="sitemap:changefreq" />
                      </span>
                    </td>
                    <td>
                      <xsl:variable name="p" select="sitemap:priority" />
                      <xsl:choose>
                        <xsl:when test="$p &gt;= 0.8">
                          <span class="pill pill-p-high"><xsl:value-of select="$p" /></span>
                        </xsl:when>
                        <xsl:when test="$p &gt;= 0.5">
                          <span class="pill pill-p-mid"><xsl:value-of select="$p" /></span>
                        </xsl:when>
                        <xsl:otherwise>
                          <span class="pill pill-p-low"><xsl:value-of select="$p" /></span>
                        </xsl:otherwise>
                      </xsl:choose>
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
        </div>

        <footer>
          Generated by <a href="https://pixiebot.co">Pixie</a> · <a href="https://www.sitemaps.org/protocol.html" target="_blank" rel="noopener">Sitemap Protocol</a>
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
