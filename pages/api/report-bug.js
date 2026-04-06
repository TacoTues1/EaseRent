import { sendNotificationEmail } from '../../lib/email'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, description, attachmentName, attachmentContent } = req.body
  const reporterName = (name || '').trim() || 'Anonymous'

  if (!description) {
    return res.status(400).json({ error: 'Description is required' })
  }

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333;">
      <h2 style="color: #eab308; border-bottom: 2px solid #eab308; padding-bottom: 10px;">🚨 New Bug Report</h2>
      <p><strong>Reporter Name:</strong> ${reporterName}</p>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #eab308;">
        <p style="margin: 0; white-space: pre-wrap;">${description}</p>
      </div>
      ${attachmentName ? `<p><em>See attached file: ${attachmentName}</em></p>` : ''}
    </div>
  `

  try {
    const emailConfig = {
      to: 'alfnzperez@gmail.com',
      subject: `🚨 Bug Report from: ${reporterName}`,
      message: htmlContent
    }

    if (attachmentName && attachmentContent) {
      emailConfig.attachment = [
        {
          name: attachmentName,
          content: attachmentContent
        }
      ]
    }

    const result = await sendNotificationEmail(emailConfig)

    if (!result.success) throw new Error(result.error)

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Bug report error:', error)
    return res.status(500).json({ error: 'Failed to send bug report' })
  }
}
