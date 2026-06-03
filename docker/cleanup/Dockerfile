FROM alpine:3.20

RUN apk add --no-cache curl

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN addgroup -g 10001 -S appuser \
    && adduser -u 10001 -S -G appuser appuser

USER appuser

ENTRYPOINT ["/entrypoint.sh"]
