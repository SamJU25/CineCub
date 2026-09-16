# Multi-stage build for ultra-lightweight, high-performance Go backend
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod ./
RUN go mod download || true

# Copy source code and compile static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# Final minimal production container (< 20 MB total image size)
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata ffmpeg

WORKDIR /app
COPY --from=builder /app/server /app/server

EXPOSE 10000
ENV PORT=10000

CMD ["/app/server"]
