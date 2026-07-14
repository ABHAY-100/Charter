# Use a lightweight Node.js base image
FROM node:20-alpine

# Create a non-root user
RUN addgroup -S app && adduser -S -G app app

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY --chown=app:app package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the code
COPY --chown=app:app . .

# Ensure correct permissions
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Expose port
EXPOSE 5000

# Run the app
CMD ["node", "server.js"]
