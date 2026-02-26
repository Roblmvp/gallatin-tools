// api/send-to-crm.js
// Vercel serverless function — sends ADF/XML lead email to DriveCentric
// Deploy to: gallatin-tools/api/send-to-crm.js

const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    first_name, last_name, phone, email,
    veh_year, veh_make, veh_model, veh_trim, veh_miles,
    repair_cost, eng_score, outcome, notes,
    trade_interest, voi, submitter,
    contact_pref, best_time, cust_emotion,
    ro_num, svc_advisor, veh_ownership,
    trade_acv, voi_budget, timeline,
  } = req.body;

  // Build ADF/XML — industry standard automotive lead format
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prospectName = `${first_name || 'Unknown'} ${last_name || ''}`.trim();

  const adfXml = `<?xml version="1.0" encoding="UTF-8"?>
<?adf version="1.0"?>
<adf>
  <prospect status="new">
    <id sequence="1" source="ServiceBridge">SB-${Date.now()}</id>
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
        ${phone ? `<phone type="voice" time="${best_time || 'nopreference'}">${phone}</phone>` : ''}
        ${email ? `<email>${email}</email>` : ''}
      </contact>
      <comments>SERVICE DRIVE LEAD — ServiceBridge S2S
Rep: ${submitter || 'Unknown'}
RO #: ${ro_num || 'N/A'}
Service Advisor: ${svc_advisor || 'N/A'}
Current Vehicle: ${veh_year || ''} ${veh_make || ''} ${veh_model || ''} ${veh_trim || ''} (${veh_miles || 'N/A'} mi)
Ownership: ${veh_ownership || 'N/A'}
Repair Cost: ${repair_cost ? '$' + repair_cost : 'N/A'}
Engagement Score: ${eng_score || 'N/A'}/10
Customer Emotion: ${cust_emotion || 'N/A'}
Trade Interest: ${trade_interest || 'N/A'}
Trade ACV: ${trade_acv ? '$' + trade_acv : 'N/A'}
VOI: ${voi || 'N/A'}
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

  // Send via Gmail SMTP (use env vars set in Vercel dashboard)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"ServiceBridge — Gallatin CDJR" <${process.env.SMTP_USER}>`,
      to: 'campaignleads@drivegallatincdjr.com',
      subject: `New Service-to-Sales Lead: ${prospectName} — ${veh_year || ''} ${veh_make || ''} ${veh_model || ''}`,
      text: adfXml,
      html: `<pre style="font-family:monospace;font-size:12px;">${adfXml.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`,
    });

    return res.status(200).json({ success: true, message: `Lead pushed to DriveCentric for ${prospectName}` });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Failed to send email', detail: err.message });
  }
}
