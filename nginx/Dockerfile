FROM nginx:alpine

# Install OpenSSL for certificate generation
RUN apk add --no-cache openssl

# Create SSL directory
RUN mkdir -p /etc/ssl/private

# Generate self-signed SSL certificate (100 years)
RUN openssl req -x509 -newkey rsa:4096 \
    -keyout /etc/ssl/private/key.pem \
    -out /etc/ssl/certs/cert.pem \
    -days 36500 \
    -nodes \
    -subj "/C=US/ST=State/L=City/O=MeetMemo/CN=localhost"

# Set proper permissions
RUN chmod 600 /etc/ssl/private/key.pem
RUN chmod 644 /etc/ssl/certs/cert.pem

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443