"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scenes, type SceneCue } from "../data/scenes";
import { SceneTimeline } from "./SceneTimeline";
import { SceneFacts } from "./SceneFacts";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const CURVE_POINTS = [
  [0.1, 0.35],
  [0.25, 0.22],
  [0.5, 0.18],
  [0.75, 0.24],
  [0.9, 0.33],
];

type PlaybackState = "idle" | "playing" | "rendering" | "completed" | "error";

export function WorldVideoStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [activeScene, setActiveScene] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const totalDurationMs = useMemo(
    () => scenes.reduce((acc, scene) => acc + scene.duration * 1000, 0),
    []
  );

  const clearAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback(
    (finalize = false) => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        const recorder = recorderRef.current;
        return new Promise<void>((resolve) => {
          recorder.onstop = () => {
            if (finalize) {
              const blob = new Blob(recordedChunksRef.current, {
                type: "video/webm",
              });
              setVideoUrl(URL.createObjectURL(blob));
            }
            recordedChunksRef.current = [];
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            recorderRef.current = null;
            resolve();
          };
          recorder.stop();
        });
      }
      return Promise.resolve();
    },
    []
  );

  const drawScene = useCallback(
    (ctx: CanvasRenderingContext2D, scene: SceneCue, sceneProgress: number, globalProgress: number) => {
      const { width, height } = ctx.canvas;
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, scene.palette.start);
      backgroundGradient.addColorStop(1, scene.palette.end);
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, height);

      const glowRadius = height * (0.45 + Math.sin(globalProgress * Math.PI * 2) * 0.03);
      const glowGradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.52,
        glowRadius * 0.2,
        width * 0.5,
        height * 0.53,
        glowRadius
      );
      glowGradient.addColorStop(0, scene.palette.glow);
      glowGradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(0, 0, width, height);

      drawEarth(ctx, scene, sceneProgress, globalProgress);
      drawAtmosphericRings(ctx, sceneProgress, scene.palette.accent);
      drawIllustration(ctx, scene, sceneProgress);

      drawTitleCard(ctx, scene, sceneProgress);

      ctx.restore();
    },
    []
  );

  const renderFrame = useCallback(
    (timestamp: number) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      if (elapsed >= totalDurationMs) {
        drawScene(ctx, scenes[scenes.length - 1], 1, 1);
        clearAnimation();
        startTimeRef.current = null;
        const isRecording =
          recorderRef.current !== null && recorderRef.current.state !== "inactive";
        if (isRecording) {
          stopRecorder(true).finally(() => setPlaybackState("completed"));
        } else {
          setPlaybackState("completed");
        }
        return;
      }

      let cumulative = 0;
      let currentIndex = 0;
      for (let i = 0; i < scenes.length; i += 1) {
        const sceneDuration = scenes[i].duration * 1000;
        if (elapsed < cumulative + sceneDuration) {
          currentIndex = i;
          break;
        }
        cumulative += sceneDuration;
      }

      if (activeScene !== currentIndex) {
        setActiveScene(currentIndex);
      }

      const currentScene = scenes[currentIndex];
      const sceneProgress = (elapsed - cumulative) / (currentScene.duration * 1000);
      const globalProgress = elapsed / totalDurationMs;
      drawScene(ctx, currentScene, sceneProgress, globalProgress);

      animationRef.current = requestAnimationFrame(renderFrame);
    },
    [activeScene, clearAnimation, drawScene, stopRecorder, totalDurationMs]
  );

  const initialiseRecorder = useCallback(() => {
    if (!canvasRef.current) return false;
    if (typeof window === "undefined") return false;
    if (!("MediaRecorder" in window)) {
      setPlaybackState("error");
      return false;
    }
    const stream = canvasRef.current.captureStream(30);
    if (!stream) return false;
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9"
      });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      return true;
    } catch (error) {
      console.error("Failed to initialise MediaRecorder", error);
      setPlaybackState("error");
      return false;
    }
  }, []);

  const startPlayback = useCallback(
    (record = false) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      clearAnimation();
      startTimeRef.current = null;
      setVideoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });

      if (record) {
        const canRecord = initialiseRecorder();
        if (!canRecord) return;
        setPlaybackState("rendering");
        recorderRef.current?.start();
      } else {
        setPlaybackState("playing");
      }

      animationRef.current = requestAnimationFrame(renderFrame);
    },
    [clearAnimation, initialiseRecorder, renderFrame]
  );

  const stopPlayback = useCallback(() => {
    clearAnimation();
    startTimeRef.current = null;
    if (playbackState === "rendering") {
      stopRecorder(true).then(() => setPlaybackState("idle"));
    } else {
      setPlaybackState("idle");
    }
  }, [clearAnimation, playbackState, stopRecorder]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, scenes[0], 0, 0);
    setActiveScene(0);
    return () => {
      clearAnimation();
      void stopRecorder();
      startTimeRef.current = null;
    };
  }, [clearAnimation, drawScene, stopRecorder]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const disablePlayback = playbackState === "playing" || playbackState === "rendering";

  return (
    <div className="studio">
      <section className="studio__sidebar">
        <header className="studio__hero">
          <h1>فيديو كوكب الأرض</h1>
          <p>
            صمّم رحلتك البصرية حول العالم بضغطة زر. شاهد الكوكب من الفضاء، 
            ثم تجوّل في أعماق المحيطات وغابات الأمازون، واستخرج فيديو حديثًا لرحلة كاملة.
          </p>
        </header>
        <SceneTimeline
          scenes={scenes}
          activeIndex={activeScene}
          totalDurationMs={totalDurationMs}
          playbackState={playbackState}
        />
        <div className="studio__controls">
          <button
            type="button"
            className="primary"
            onClick={() => startPlayback(false)}
            disabled={disablePlayback}
          >
            معاينة متحركة
          </button>
          <button
            type="button"
            onClick={() => startPlayback(true)}
            disabled={disablePlayback}
            className="secondary"
          >
            توليد فيديو 720p
          </button>
          <button
            type="button"
            onClick={stopPlayback}
            disabled={playbackState === "idle"}
            className="ghost"
          >
            إيقاف
          </button>
        </div>
        <SceneFacts scene={scenes[activeScene]} />
      </section>
      <section className="studio__canvas">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="studio__preview"
        />
        <footer className="studio__status">
          <span className="status-label">
            {playbackState === "rendering" && "جارٍ تصدير الفيديو..."}
            {playbackState === "playing" && "تشغيل فوري"}
            {playbackState === "completed" && "أكتمل! يمكنك تنزيل الفيديو."}
            {playbackState === "idle" && "جاهز للبدء"}
            {playbackState === "error" && "تعذر إنشاء الفيديو، حاول مرة أخرى."}
          </span>
          {videoUrl && (
            <a
              href={videoUrl}
              download="world-tour.webm"
              className="download-link"
            >
              تنزيل الفيديو النهائي
            </a>
          )}
        </footer>
      </section>
    </div>
  );
}

function drawEarth(
  ctx: CanvasRenderingContext2D,
  scene: SceneCue,
  sceneProgress: number,
  globalProgress: number
) {
  const { width, height } = ctx.canvas;
  const radius = height * 0.28;
  const centerX = width * 0.42 + Math.sin(globalProgress * Math.PI * 2) * width * 0.06;
  const centerY = height * 0.52 + Math.cos(sceneProgress * Math.PI) * height * 0.02;

  const earthGradient = ctx.createRadialGradient(
    centerX - radius * 0.35,
    centerY - radius * 0.4,
    radius * 0.2,
    centerX,
    centerY,
    radius * 1.1
  );
  earthGradient.addColorStop(0, "rgba(255, 255, 255, 0.65)");
  earthGradient.addColorStop(0.35, scene.palette.accent);
  earthGradient.addColorStop(1, scene.palette.start);

  ctx.fillStyle = earthGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.4;
  for (let lat = -60; lat <= 60; lat += 20) {
    const latRadius = radius * Math.cos((lat * Math.PI) / 180);
    const latY = centerY + radius * Math.sin((lat * Math.PI) / 180);
    ctx.beginPath();
    for (let angle = 0; angle <= Math.PI * 2; angle += Math.PI / 90) {
      const px = centerX + latRadius * Math.cos(angle);
      const py = latY + (radius * Math.sin(angle) * Math.sin((lat * Math.PI) / 180)) / radius;
      if (angle === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  for (let lon = -120; lon <= 120; lon += 30) {
    ctx.beginPath();
    for (let theta = 0; theta <= Math.PI * 2; theta += Math.PI / 90) {
      const x = centerX + radius * Math.sin(theta) * Math.cos((lon * Math.PI) / 180);
      const y = centerY + radius * Math.cos(theta);
      if (theta === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawAtmosphericRings(ctx: CanvasRenderingContext2D, sceneProgress: number, accent: string) {
  const { width, height } = ctx.canvas;
  const baseRadius = height * 0.32;
  const centerX = width * 0.42;
  const centerY = height * 0.52;

  ctx.save();
  ctx.strokeStyle = `${accent}aa`;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 14]);
  for (let i = 0; i < 4; i += 1) {
    const expansion = baseRadius + i * 42 + Math.sin(sceneProgress * Math.PI * 2 + i) * 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, expansion, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIllustration(ctx: CanvasRenderingContext2D, scene: SceneCue, sceneProgress: number) {
  switch (scene.illustration) {
    case "sunrise":
      drawSunrise(ctx, sceneProgress, scene.palette.accent);
      break;
    case "cities":
      drawCityLights(ctx, sceneProgress, scene.palette.accent);
      break;
    case "forest":
      drawForestCanopy(ctx, sceneProgress, scene.palette.accent);
      break;
    case "desert":
      drawDesert(ctx, sceneProgress, scene.palette.accent);
      break;
    case "oceans":
      drawSea(ctx, sceneProgress, scene.palette.accent);
      break;
    case "stars":
      drawStarscape(ctx, sceneProgress, scene.palette.accent);
      break;
    default:
      break;
  }
}

function drawTitleCard(ctx: CanvasRenderingContext2D, scene: SceneCue, sceneProgress: number) {
  const { width } = ctx.canvas;
  const baseX = width * 0.64;
  const baseY = 160;
  const opacity = Math.min(1, Math.max(0, Math.sin(sceneProgress * Math.PI)));

  ctx.save();
  ctx.globalAlpha = opacity;

  ctx.fillStyle = "rgba(3, 9, 20, 0.4)";
  ctx.fillRect(baseX - 60, baseY - 50, width * 0.26, 240);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "700 36px var(--font-arabic)";
  ctx.fillText(scene.title, baseX, baseY);

  ctx.font = "400 24px var(--font-arabic)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.fillText(scene.subtitle, baseX, baseY + 42);

  wrapText(ctx, scene.description, baseX, baseY + 90, width * 0.24, 30);

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  words.forEach((word) => {
    const testLine = line + word + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== "") {
      ctx.fillText(line, x, y);
      line = `${word} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  });
  ctx.fillText(line.trim(), x, y);
}

function drawSunrise(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  const sunY = height * (0.65 - Math.pow(progress, 0.7) * 0.25);
  const sunRadius = 220;

  const gradient = ctx.createRadialGradient(width * 0.48, sunY, sunRadius * 0.4, width * 0.5, sunY, sunRadius);
  gradient.addColorStop(0, `${accent}`);
  gradient.addColorStop(1, "rgba(255, 93, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(width * 0.5, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height * 0.68);
  CURVE_POINTS.forEach(([px, py], index) => {
    const pointProgress = progress * (index + 1);
    const controlX = width * (px + 0.08 * Math.sin(pointProgress * Math.PI));
    const controlY = height * (py + 0.04 * Math.cos(pointProgress * 2 * Math.PI));
    ctx.lineTo(controlX, height * py);
  });
  ctx.lineTo(width * 0.82, height * 0.72);
  ctx.stroke();
}

function drawCityLights(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  const layers = 4;
  for (let layer = 0; layer < layers; layer += 1) {
    const opacity = 0.15 + layer * 0.1;
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    const buildingHeight = 80 + layer * 30;
    for (let i = 0; i < 22; i += 1) {
      const x = width * 0.28 + i * 24 + Math.sin(progress * 2 + i) * 8;
      const h = buildingHeight + Math.sin(progress * 3 + i * 0.4) * 18;
      ctx.fillRect(x, height - h - layer * 10, 18, h);
      if (Math.random() > 0.7) {
        ctx.fillStyle = `${accent}aa`;
        ctx.fillRect(x + 4, height - h - layer * 10 + 18, 6, 12);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      }
    }
  }
}

function drawForestCanopy(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = `${accent}55`;
  for (let i = 0; i < 90; i += 1) {
    const baseX = (i / 90) * width;
    const baseY = height * 0.72 + Math.sin(progress * 2 + i * 0.3) * 12;
    const canopyHeight = 140 + Math.sin(progress * 3 + i) * 26;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.bezierCurveTo(
      baseX + 12,
      baseY - canopyHeight * 0.5,
      baseX + 26,
      baseY - canopyHeight,
      baseX + 42,
      baseY
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawDesert(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  ctx.save();
  const dunes = 5;
  for (let i = 0; i < dunes; i += 1) {
    const offset = i * 0.25;
    const amplitude = 40 + i * 12;
    ctx.fillStyle = `rgba(255, 208, 138, ${0.12 + i * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.75 + i * 18);
    for (let x = 0; x <= width; x += 12) {
      const y = height * 0.75 +
        Math.sin((x / width) * Math.PI * 2 + progress * 2 + offset) * amplitude;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawSea(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.strokeStyle = `${accent}bb`;
  ctx.lineWidth = 2;
  for (let wave = 0; wave < 6; wave += 1) {
    const offset = wave * 18;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 10) {
      const y = height * 0.62 +
        Math.sin((x / width) * Math.PI * 4 + progress * 4 + wave) * (12 + wave * 3);
      if (x === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawStarscape(ctx: CanvasRenderingContext2D, progress: number, accent: string) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (let i = 0; i < 120; i += 1) {
    const x = (i * 97) % width;
    const y = ((i * 47) % height) * (0.8 + 0.2 * Math.sin(progress * 6 + i));
    const size = (Math.sin(progress * 8 + i) + 1) * 0.8 + 0.6;
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = `${accent}88`;
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.26, 60 + Math.sin(progress * 4) * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
