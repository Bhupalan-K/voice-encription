const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

app.post('/api/notify-decryption', async (req, res) => {
  const { ownerEmail, fileName, decrypterEmail } = req.body;

  try {
    // Send email to file owner
    await transporter.sendMail({
      from: '"CryptGuard" <notifications@cryptguard.com>',
      to: ownerEmail,
      subject: 'Your encrypted file was accessed',
      html: `
        <p>Hello,</p>
        <p>Your encrypted file <strong>${fileName}</strong> was successfully decrypted by:</p>
        <p><strong>Email:</strong> ${decrypterEmail}</p>
        <p>If you didn't authorize this decryption, please take appropriate security measures.</p>
        <p>Best regards,<br>CryptGuard Team</p>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));