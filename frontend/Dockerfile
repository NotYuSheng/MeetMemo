FROM node:18
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

RUN npm install react-router-dom jspdf lucide-react react-markdown remark-gfm

EXPOSE 3000
EXPOSE 4000

COPY . /app

# Build React app
RUN npm run build

# Start React dev server AND upload server
CMD ["sh", "-c", "npm start"]
