FROM alpine:3.24 AS pdf-tools
RUN apk add --no-cache poppler-utils poppler-data util-linux-misc ffmpeg && \
    mkdir -p /out/pdf-runtime/usr/bin /out/pdf-runtime/usr/share/doc/briofold-pdf && \
    cp /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/pdftotext /usr/bin/prlimit /out/pdf-runtime/usr/bin/ && \
    for program in /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/pdftotext /usr/bin/prlimit; do \
      for library in $(ldd "$program" | awk '$1 ~ /^\// {print $1} $3 ~ /^\// {print $3}'); do \
        mkdir -p "/out/pdf-runtime$(dirname "$library")"; \
        cp -L "$library" "/out/pdf-runtime$library"; \
      done; \
    done && \
    cp -a /usr/share/poppler /out/pdf-runtime/usr/share/ && \
    if [ -d /etc/fonts ]; then mkdir -p /out/pdf-runtime/etc; cp -a /etc/fonts /out/pdf-runtime/etc/; fi && \
    if [ -d /usr/share/licenses ]; then cp -a /usr/share/licenses /out/pdf-runtime/usr/share/; fi && \
    apk info -v ffmpeg poppler-utils poppler-data util-linux-misc > /out/pdf-runtime/usr/share/doc/briofold-pdf/packages.txt
COPY internal/knowledge/PDF-RUNTIME-NOTICE.txt /out/pdf-runtime/usr/share/doc/briofold-pdf/NOTICE.txt

FROM golang:1.27.0-alpine AS build
WORKDIR /src
COPY --from=pdf-tools /out/pdf-runtime/ /
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN go mod download && go test ./internal/knowledge
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -o /out/worker ./cmd/worker && \
    CGO_ENABLED=0 go build -trimpath -o /out/financial-sync ./cmd/financial-sync

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=pdf-tools /out/pdf-runtime/ /
COPY --from=build /out/api /api
COPY --from=build /out/worker /worker
COPY --from=build /out/financial-sync /financial-sync
USER nonroot:nonroot
RUN ["/usr/bin/prlimit", "--as=134217728", "--cpu=3", "--nofile=32", "--nproc=16", "--", "/usr/bin/pdftotext", "-v"]
EXPOSE 8080
ENTRYPOINT ["/api"]
