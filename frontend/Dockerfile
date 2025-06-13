FROM node:18
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

# Optional: install express and multer for the upload server
RUN npm install express multer

EXPOSE 3000
EXPOSE 4000

COPY . .

# Build React app
RUN npm run build

# Start React dev server AND upload server
CMD ["sh", "-c", "npm start & node upload-server.js"]
