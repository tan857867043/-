import React, { useRef, useState, useEffect } from 'react';
import { Vector2D } from '../types';

interface JoystickProps {
    onMove: (vector: Vector2D) => void;
    onEnd: () => void;
}

const Joystick: React.FC<JoystickProps> = ({ onMove, onEnd }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isActive, setIsActive] = useState(false);
    const [origin, setOrigin] = useState({ x: 0, y: 0 });

    const maxRadius = 50;

    const handleStart = (clientX: number, clientY: number) => {
        setIsActive(true);
        setOrigin({ x: clientX, y: clientY });
        setPosition({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
    };

    const handleMove = (clientX: number, clientY: number) => {
        if (!isActive) return;

        const dx = clientX - origin.x;
        const dy = clientY - origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        let moveX = dx;
        let moveY = dy;

        if (distance > maxRadius) {
            const angle = Math.atan2(dy, dx);
            moveX = Math.cos(angle) * maxRadius;
            moveY = Math.sin(angle) * maxRadius;
        }

        setPosition({ x: moveX, y: moveY });
        
        // Normalize output -1 to 1
        onMove({
            x: moveX / maxRadius,
            y: moveY / maxRadius
        });
    };

    const handleEnd = () => {
        setIsActive(false);
        setPosition({ x: 0, y: 0 });
        onEnd();
    };

    return (
        <div 
            ref={containerRef}
            className="absolute bottom-10 left-10 w-48 h-48 z-40 touch-none flex items-center justify-center"
            onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={handleEnd}
            onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
            onMouseMove={(e) => {
                if (isActive) handleMove(e.clientX, e.clientY);
            }}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
        >
            {/* Base */}
            <div className={`w-32 h-32 rounded-full border-2 border-slate-500/50 bg-slate-900/40 backdrop-blur-sm transition-opacity ${isActive ? 'opacity-100' : 'opacity-30'}`}>
                {/* Stick */}
                <div 
                    className="w-16 h-16 rounded-full bg-slate-200/80 shadow-lg absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`
                    }}
                >
                    <div className="w-full h-full rounded-full border-4 border-slate-400 opacity-50"></div>
                </div>
            </div>
        </div>
    );
};

export default Joystick;
