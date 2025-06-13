# Use Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Install dependencies directly (no package.json needed)
RUN npm install express multer cors

# Copy your application files into the image
COPY . .

# Create the upload directory and set permissions
RUN mkdir -p /app/audiofiles && chmod 777 /app/audiofiles

# Expose the API port
EXPOSE 4000

# Start the server
CMD ["node", "upload-server.js"]
