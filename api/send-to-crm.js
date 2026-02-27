export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      first_name, last_name, phone, email,
      veh_year, veh_make, veh_model, veh_trim, veh_miles,
      repair_cost, eng_score, outcome, notes,
      trade_interest, trade_acv, trade_expect,
      voi, voi_budget, timeline,
      submitter, contact_pref, best_time, cust_emotion,
      ro_num, svc_advisor, veh_ownership,
    } = req.body;

    const prospectName = `${first_name || 'Unknown'} ${last_name || ''}`.trim();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const uniqueId = `SB-${Date.now()}`;
    const vehicleStr = [veh_year, veh_make, veh_model].filter(Boolean).join(' ') || 'Unknown Vehicle';

    // ── ADF/XML — DriveCentric standard format ──────────────────────────
    // Sent to: campaignleads@drivegallatincdjr.com
    // DriveCentric auto-parses ADF/XML from the text body of the email
    // FIXED: All <name> tags now properly close with </name> (was </n> before)
    const adfXml = `<?xml version="1.0" encoding="UTF-8"?>
<?adf version="1.0"?>
<adf>
  <prospect status="new">
    <id sequence="1" source="ServiceBridge">${uniqueId}</id>
    <requestdate>${now}</requestdate>
    <vehicle interest="buy" status="used">
      <year>${veh_year || ''}</year>
      <make>${veh_make || ''}</make>
      <model>${veh_model || ''}</model>
      <trim>${veh_trim || ''}</trim>
      <odometer units="mi">${veh_miles || ''}</odometer>
    </vehicle>
    <customer>
      <contact primarycontact="1">
        <name part="full">${prospectName}</name>
        ${phone ? `<phone type="voice">${phone}</phone>` : ''}
        ${email ? `<email>${email}</email>` : ''}
      </contact>
      <comments>SERVICE DRIVE LEAD - ServiceBridge S2S
Rep: ${submitter || 'Unknown'}
RO #: ${ro_num || 'N/A'}
Service Advisor: ${svc_advisor || 'N/A'}
Current Vehicle: ${[veh_year, veh_make, veh_model, veh_trim].filter(Boolean).join(' ')} ${veh_miles ? `(${veh_miles} mi)` : ''}
Ownership: ${veh_ownership || 'N/A'}
Repair Cost: ${repair_cost ? '$' + repair_cost : 'N/A'}
Engagement Score: ${eng_score || 'N/A'}/10
Customer Emotion: ${cust_emotion || 'N/A'}
Trade Interest: ${trade_interest || 'N/A'}
Trade ACV: ${trade_acv ? '$' + trade_acv : 'N/A'}
Customer Expected: ${trade_expect ? '$' + trade_expect : 'N/A'}
Vehicle of Interest: ${voi || 'N/A'}
Budget: ${voi_budget || 'N/A'}
Timeline: ${timeline || 'N/A'}
Contact Preference: ${contact_pref || 'N/A'}
Best Time: ${best_time || 'N/A'}
Outcome: ${outcome || 'N/A'}
Rep Notes: ${notes || 'None'}
      </comments>
    </customer>
    <vendor>
      <vendorname>Gallatin Chrysler Dodge Jeep Ram</vendorname>
      <contact>
        <name part="full">${submitter || 'ServiceBridge'}</name>
      </contact>
    </vendor>
    <provider>
      <name>ServiceBridge by Vyaxis</name>
      <service>Service-to-Sales Lead Conversion</service>
      <url>https://servicebridge.vyaxis.com</url>
    </provider>
    <source>Service to Sales</source>
  </prospect>
</adf>`;

    const scoreInt = parseInt(eng_score) || 0;
    const scoreColor = scoreInt >= 8 ? '#ef4444' : scoreInt >= 5 ? '#f59e0b' : '#6366f1';
    const scoreBg = scoreInt >= 8 ? '#fef2f2' : scoreInt >= 5 ? '#fffbeb' : '#eef2ff';
    const scoreLabel = scoreInt >= 8 ? '🔥 HOT' : scoreInt >= 5 ? '⚡ WARM' : '❄️ COOL';

    // ── Send via Resend to DriveCentric campaign email ──────────────────
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer re_YQ2WKxeU_3uf47V8XekvjuK9GGzQYoKHC`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ServiceBridge <alerts@vyaxis.com>',
        to: ['campaignleads@drivegallatincdjr.com'],
        subject: `New S2S Lead: ${prospectName} — ${vehicleStr}`,
        text: adfXml,
        html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1a1a2e;padding:20px;border-radius:8px 8px 0 0;">
    <h2 style="color:#818CF8;margin:0;font-size:18px;">New Service-to-Sales Lead</h2>
    <p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">ServiceBridge &rarr; DriveCentric &middot; Source: Service to Sales</p>
  </div>
  <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;">
    <div style="display:inline-block;background:${scoreBg};border:1px solid ${scoreColor};border-radius:6px;padding:6px 14px;margin-bottom:16px;">
      <span style="font-size:12px;font-weight:700;color:${scoreColor};">${scoreLabel} &mdash; Temp Score: ${eng_score || '?'}/10</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:7px 0;color:#64748b;width:40%;">Customer</td><td style="padding:7px 0;font-weight:700;">${prospectName}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Phone</td><td style="padding:7px 0;">${phone || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Email</td><td style="padding:7px 0;">${email || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Vehicle</td><td style="padding:7px 0;">${vehicleStr}${veh_miles ? ' &middot; ' + veh_miles + ' mi' : ''}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Repair Cost</td><td style="padding:7px 0;">${repair_cost ? '$' + repair_cost : '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Temp Score</td><td style="padding:7px 0;font-weight:700;color:${scoreColor};">${eng_score || '&mdash;'}/10</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Vehicle of Interest</td><td style="padding:7px 0;">${voi || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Trade Interest</td><td style="padding:7px 0;">${trade_interest || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Timeline</td><td style="padding:7px 0;">${timeline || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Rep</td><td style="padding:7px 0;">${submitter || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">RO #</td><td style="padding:7px 0;">${ro_num || '&mdash;'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748b;">Lead Source</td><td style="padding:7px 0;font-weight:700;color:#22c55e;">Service to Sales</td></tr>
    </table>
    ${notes ? `<div style="margin-top:16px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;"><strong>Rep Notes:</strong> ${notes}</div>` : ''}
  </div>
  <div style="background:#0f172a;padding:14px 20px;border-radius:0 0 8px 8px;">
    <p style="color:#475569;font-size:10px;margin:0 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">ADF/XML (auto-parsed by DriveCentric)</p>
    <pre style="color:#64748b;font-size:10px;margin:0;white-space:pre-wrap;font-family:monospace;overflow-x:auto;">${adfXml.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
  </div>
</div>`,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      return res.status(200).json({ success: true, id: data.id, name: prospectName });
    } else {
      return res.status(400).json({ success: false, error: data.message });
    }

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
