# Architecture

Open EasyX is a single deployable application.

```text
Browser
  └── Open EasyX React application
        ├── workspace, discovery, downloads, logs, plugins
        └── media library, player, live cams, subtitles
              │
              ▼
One Fastify server on :3210
  ├── downloader database and queue
  ├── media catalog and playback database
  ├── plugin manager and Git repository manager
  ├── live stream proxy
  └── optional local subtitle worker child process
              │
              ▼
Shared /media and /data volumes
```

The two SQLite databases isolate acquisition state from playback/catalog state, but both are owned by the same server process and stored in the same `/data` volume. A completed queue item is atomically moved out of `/media/.downloads` and immediately triggers the in-process catalog scan.

The subtitle worker is a local compute worker owned and supervised by the same container. It is not a Viewer or Downloader web application and exposes no separate port.
