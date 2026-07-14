import { fetchParticipants, fetchEventDetails, fetchWinners } from '../services/fetch.service.js';
import { generateCertificateBuffer, clearCache } from './generate.controller.js';
import { sendCertificateEmail, verifyConnection } from '../services/email.service.js';

function capitalizeName(name) {
  if (!name) return '';
  return name
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

async function processCertificates(eventId, token, cName) {
  try {
    // Verify SMTP connection
    const smtpConnected = await verifyConnection();
    if (!smtpConnected) {
      throw new Error('Failed to connect to SMTP server. Please check your email configuration.');
    }

    // Fetch event details
    const eventDetails = await fetchEventDetails(eventId, token);
    const eventName = eventDetails.name;

    // Fetch all participants details
    let participantData = await fetchParticipants(eventId, token);
    if (!Array.isArray(participantData)) {
      participantData = Object.values(participantData);
    }

    // Fetch winners details
    const winnersData = await fetchWinners(eventId, token);
    const winners = winnersData.results || [];

    // Winners mapping
    const winnersMap = winners.reduce((map, winner) => {
      if (winner.teamName?.trim()) {
        map.set(winner.teamName.trim(), { position: winner.position });
      }
      return map;
    }, new Map());

    // Process participants
    const processedParticipants = participantData
      .filter(p => p.checkedIn === true)
      .map(p => {
        const teamName = p.team.name?.trim();
        const isWinner = winnersMap.has(teamName);

        return {
          id: p.excelId,
          name: p.user.name?.trim(),
          gender: p.user.gender?.trim(),
          email: p.user.email?.trim(),
          phone: p.user.mobileNumber?.trim(),
          team: {
            id: p.team.id,
            name: teamName
          },
          isWinner,
          position: isWinner ? winnersMap.get(teamName).position : null,
          isCheckedIn: p.checkedIn
        };
      });

    if (processedParticipants.length === 0) {
      throw new Error('No checked-in participants found.');
    }

    const BATCH_SIZE = 14; // Batch size for processing
    const emailsSent = [];
    const failedEmails = [];
    let sentCount = 0;

    // Batch processing
    for (let i = 0; i < processedParticipants.length; i += BATCH_SIZE) {
      const batch = processedParticipants.slice(i, i + BATCH_SIZE);
      const batchStart = Date.now();
      const batchPromises = batch.map(async (participant) => {
        participant.name = capitalizeName(participant.name);

        // Skip if no email is provided
        if (!participant.email) {
          return {
            id: participant.id,
            name: participant.name,
            status: "skipped",
            error: "No email provided"
          };
        }

        try {
          const displayName = participant.isWinner ? participant.team.name : participant.name;

          // Generate certificate buffer
          let pdfBuffer;
          try {
            pdfBuffer = await generateCertificateBuffer(
              displayName,
              eventName,
              participant.isWinner ? 1 : 0,
              participant.position,
              cName
            );
          } catch (certError) {
            console.error(`Certificate generation failed for ${participant.name}: ${certError.message}`);
            return {
              id: participant.id,
              name: participant.name,
              email: participant.email,
              status: "failed",
              error: `Certificate generation failed: ${certError.message}`
            };
          }

          // Send email with certificate attached
          try {
            sendCertificateEmail(
              participant.email,
              participant.name,
              eventName,
              participant.isWinner,
              participant.position,
              pdfBuffer
            );
          } catch (emailError) {
            console.error(`Email sending failed for ${participant.name}: ${emailError.message}`);
            return {
              id: participant.id,
              name: participant.name,
              email: participant.email,
              status: "failed",
              error: `Email sending failed: ${emailError.message}`
            };
          }

          return {
            id: participant.id,
            name: participant.name,
            gender: participant.gender,
            email: participant.email,
            phone: participant.phone,
            team: {
              id: participant.team.id,
              name: participant.team.name
            },
            isWinner: participant.isWinner,
            position: participant.position,
            status: "sent",
          };
        } catch (error) {
          console.error(`Unexpected error processing ${participant.name}: ${error.message}`);
          return {
            id: participant.id,
            name: participant.name,
            email: participant.email,
            status: "failed",
            error: `Unexpected error: ${error.message}`
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      const successful = batchResults.filter(result => result.status === "sent");
      const failed = batchResults.filter(result => result.status === "failed" || result.status === "skipped");

      emailsSent.push(...successful);
      sentCount += successful.length;
      failedEmails.push(...failed);

      // Ensure each batch takes at least 1 second
      const elapsed = Date.now() - batchStart;
      if (elapsed < 1000 && i + BATCH_SIZE < processedParticipants.length) {
        await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
      }
    }

    clearCache();

    return {
      eventName,
      sentCount,
      emailsSent,
      failedCount: failedEmails.length,
      failedEmails
    };
  } catch (error) {
    console.error('Certificate processing failed:', error);
    throw new Error(`Certificate email sending failed: ${error.message}`);
  }
}

export { processCertificates };
