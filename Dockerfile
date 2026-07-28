# The Little Arcade — static site, served by nginx.
# Coolify: Build Pack = Dockerfile, Port = 80. Nothing else to configure.
FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html            /usr/share/nginx/html/
COPY manifest.webmanifest  /usr/share/nginx/html/
COPY icon.svg              /usr/share/nginx/html/
COPY css                   /usr/share/nginx/html/css
COPY js                    /usr/share/nginx/html/js
COPY dist                  /usr/share/nginx/html/dist

# Serve the single-file build at /solo for handing round on a USB stick.
RUN cp /usr/share/nginx/html/dist/index.html /usr/share/nginx/html/solo.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
