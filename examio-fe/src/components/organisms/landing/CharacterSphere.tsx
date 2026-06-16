import { useEffect, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789|_/-";

export default function CharacterSphere() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        let width = 0;
        let height = 0;

        function resize() {
            const rect = canvas!.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas!.width = Math.round(width * dpr);
            canvas!.height = Math.round(height * dpr);
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        resize();
        window.addEventListener("resize", resize);

        let time = 0;
        const points: { x: number; y: number; z: number; char: string }[] = [];

        function render() {
            if (width === 0 || height === 0) {
                frameRef.current = requestAnimationFrame(render);
                return;
            }

            ctx!.clearRect(0, 0, width, height);

            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) * 0.40;

            // Detect current theme --ink color from CSS variable
            const ink = getComputedStyle(canvas!).getPropertyValue("--ink").trim() || "#1a1a18";

            ctx!.font = "13px monospace";
            ctx!.textAlign = "center";
            ctx!.textBaseline = "middle";

            points.length = 0;

            // Generate sphere points (latitude/longitude grid)
            for (let phi = 0; phi < Math.PI * 2; phi += 0.13) {
                for (let theta = 0; theta < Math.PI; theta += 0.13) {
                    const x = Math.sin(theta) * Math.cos(phi + time * 0.5);
                    const y = Math.sin(theta) * Math.sin(phi + time * 0.5);
                    const z = Math.cos(theta);

                    // Rotate around Y axis
                    const rotY = time * 0.3;
                    const newX = x * Math.cos(rotY) - z * Math.sin(rotY);
                    const newZ = x * Math.sin(rotY) + z * Math.cos(rotY);

                    // Rotate around X axis
                    const rotX = time * 0.2;
                    const newY = y * Math.cos(rotX) - newZ * Math.sin(rotX);
                    const finalZ = y * Math.sin(rotX) + newZ * Math.cos(rotX);

                    const depth = (finalZ + 1) / 2;
                    const charIndex = Math.floor(depth * (CHARS.length - 1));

                    points.push({
                        x: centerX + newX * radius,
                        y: centerY + newY * radius,
                        z: finalZ,
                        char: CHARS[charIndex],
                    });
                }
            }

            points.sort((a, b) => a.z - b.z);

            for (const point of points) {
                const alpha = 0.1 + (point.z + 1) * 0.14;
                ctx!.fillStyle = `rgba(${hexToRgb(ink)}, ${alpha})`;
                ctx!.fillText(point.char, point.x, point.y);
            }

            time += 0.004;
            frameRef.current = requestAnimationFrame(render);
        }

        frameRef.current = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: "block" }}
            aria-hidden="true"
        />
    );
}

function hexToRgb(hex: string): string {
    // Strip leading # if present
    hex = hex.replace("#", "");
    if (hex.length === 3) {
        hex = hex.split("").map((c) => c + c).join("");
    }
    if (hex.length !== 6) return "26, 26, 24";
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}
