import nodemailer from "nodemailer";

const getTransporter = () => {
  return nodemailer.createTransport({
    pool: true,
    host: process.env.SMTP_HOST,
    maxConnections: 50,
    maxMessages: 50,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    socketTimeout: 60000,
    connectionTimeout: 30000,
  })
};

async function verifyConnection() {
  try {
    await getTransporter().verify();
    return true;
  } catch (error) {
    console.error("SMTP server connection failed:", error);
    return false;
  }
}

async function sendCertificateEmail(
  recipientEmail,
  recipientName,
  eventName,
  isWinner,
  position,
  pdfBuffer
) {
  try {
    const transporter = getTransporter();
    
    const certificateType = isWinner ? "Appreciation" : "Participation";
    const filename = `Certificate of ${certificateType} - ${eventName}.pdf`;

    const subject = isWinner
      ? `🎉 Congratulations! Your Certificate of Appreciation – ${eventName} | Excel '25`
      : `🎓 Your Certificate of Participation – ${eventName} | Excel '25`;

    const positionText =
      isWinner && position === 1
        ? "First Place"
        : isWinner && position === 2
          ? "Second Place"
          : isWinner && position === 3
            ? "Third Place"
            : null;

    const htmlContent = `
      <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
        <p>Dear <strong>${recipientName}</strong>,</p>

        ${isWinner
        ? `<p>🎉 Congratulations on achieving <strong>${positionText}</strong> in <strong>${eventName}</strong>!</p>
               <p>We’re proud to present you with this <strong>Certificate of Appreciation</strong> for your remarkable performance.</p>`
        : `<p>Thank you for participating in <strong>${eventName}</strong>.</p>
               <p>Please find attached your <strong>Certificate of Participation</strong> in recognition of your involvement.</p>`
      }

        <p>Your enthusiasm and contribution made a difference. We hope to see you in our future events!</p>

        <p>Warm regards,<br><strong>Excel Core ’25</strong></p>
      </div>
    `;

    const plainText = `
      Dear ${recipientName},

      ${isWinner
        ? `Congratulations on achieving ${positionText?.toLowerCase()} in ${eventName}! We’re proud to present you with this Certificate of Appreciation.`
        : `Thank you for participating in ${eventName}. Please find attached your Certificate of Participation.`
      }

      Your enthusiasm and contribution made a difference.

      Warm regards,  
      Excel Core '25
    `.trim();

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: recipientEmail,
      subject,
      text: plainText,
      html: htmlContent,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error(`Failed to send email to ${recipientEmail}:`, error);
    throw error;
  }
}

export { sendCertificateEmail, verifyConnection };
