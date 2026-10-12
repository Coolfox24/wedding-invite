import { useCallback, useEffect, useRef, useState } from "react";
import "./MusicToggle.css";

const videoId = "uFvzIw8wDHs";

type Player = {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (volume: number) => void;
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
};

type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    host: string;
    width: number;
    height: number;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: Player }) => void;
      onStateChange: (event: { data: number }) => void;
      onError: () => void;
      onAutoplayBlocked: () => void;
    };
  }) => Player;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | undefined;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    const previousCallback = window.onYouTubeIframeAPIReady;
    const restoreCallback = () => {
      window.clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previousCallback;
    };
    const fail = () => {
      restoreCallback();
      script.remove();
      apiPromise = undefined;
      reject(new Error("YouTube could not load"));
    };
    const timeout = window.setTimeout(fail, 15000);

    window.onYouTubeIframeAPIReady = () => {
      restoreCallback();
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
      else fail();
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return apiPromise;
}

export default function MusicToggle() {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const ready = useRef(false);
  const requested = useRef(false);
  const playbackTimeout = useRef<number | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"off" | "loading" | "playing">("off");
  const [message, setMessage] = useState("");

  const clearPlaybackTimeout = useCallback(() => {
    window.clearTimeout(playbackTimeout.current);
  }, []);

  const play = useCallback(() => {
    clearPlaybackTimeout();
    playbackTimeout.current = window.setTimeout(() => {
      requested.current = false;
      player.current?.pauseVideo();
      setStatus("off");
      setMessage("Music couldn’t start. Tap to try again.");
    }, 15000);
    player.current?.playVideo();
  }, [clearPlaybackTimeout]);

  useEffect(() => {
    if (attempt === 0 || !container.current) return;

    let disposed = false;
    const fail = (text: string) => {
      if (disposed || !requested.current) return;
      clearPlaybackTimeout();
      requested.current = false;
      setStatus("off");
      setMessage(text);
    };
    const readyTimeout = window.setTimeout(() => {
      fail("Music couldn’t load. Tap to try again.");
    }, 20000);

    loadYouTubeApi().then((api) => {
      if (disposed || !container.current) return;
      const mount = document.createElement("div");
      container.current.replaceChildren(mount);
      player.current = new api.Player(mount, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: 200,
        height: 200,
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          loop: 1,
          playlist: videoId,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (disposed) return;
            window.clearTimeout(readyTimeout);
            ready.current = true;
            target.getIframe().title = "Optional invitation music";
            target.getIframe().tabIndex = -1;
            target.setVolume(40);
            if (requested.current) play();
          },
          onStateChange: ({ data }) => {
            if (disposed) return;
            if (data === 1) {
              // A late ready/play event must not undo a guest's off click.
              if (!requested.current) {
                player.current?.pauseVideo();
                return;
              }
              clearPlaybackTimeout();
              setStatus("playing");
              setMessage("");
            } else if (data === 2) {
              clearPlaybackTimeout();
              requested.current = false;
              setStatus("off");
            }
          },
          onError: () => {
            window.clearTimeout(readyTimeout);
            fail("Music is unavailable here. You can listen on YouTube.");
            ready.current = false;
          },
          onAutoplayBlocked: () => fail("Tap again to start the music."),
        },
      });
    }).catch(() => {
      window.clearTimeout(readyTimeout);
      fail("Music couldn’t load. Tap to try again.");
    });

    return () => {
      disposed = true;
      window.clearTimeout(readyTimeout);
      clearPlaybackTimeout();
      ready.current = false;
      player.current?.destroy();
      player.current = null;
    };
  }, [attempt, clearPlaybackTimeout, play]);

  function toggleMusic() {
    setMessage("");
    if (requested.current) {
      requested.current = false;
      clearPlaybackTimeout();
      if (ready.current) player.current?.pauseVideo();
      setStatus("off");
      return;
    }

    requested.current = true;
    setStatus("loading");
    if (ready.current) play();
    else setAttempt((value) => value + 1);
  }

  return (
    <>
      <div ref={container} className="music-player" aria-hidden="true" />
      <div className="music-control">
        {message && (
          <p className="music-message" role="status">
            {message} {message.includes("YouTube") && (
              <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">Listen ↗</a>
            )}
          </p>
        )}
        <button
          className={`music-toggle ${status === "playing" ? "is-playing" : ""}`}
          type="button"
          onClick={toggleMusic}
          aria-label={status === "off" ? "Turn music on" : "Turn music off"}
          aria-pressed={status !== "off"}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 18V5l11-2v13M9 9l11-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <ellipse cx="6" cy="18" rx="3" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
            <ellipse cx="17" cy="16" rx="3" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
            {status === "off" && <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
          </svg>
          <span>{status === "loading" ? "Loading music…" : `Music ${status === "playing" ? "on" : "off"}`}</span>
        </button>
      </div>
    </>
  );
}
