'use client';

import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';
import animatedWhatsAppData from '../animated-whatsapp.json';

interface AnimatedWhatsAppProps {
  className?: string;
  /** Pixel size; defaults to the animation's natural size when omitted. */
  size?: number;
}

export default function AnimatedWhatsApp({ className = '', size }: AnimatedWhatsAppProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Load Lottie animation
    const animation = lottie.loadAnimation({
      container: container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: animatedWhatsAppData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
        progressiveLoad: true,
        hideOnTransparent: true,
      }
    });

    // Set appropriate speed
    animation.setSpeed(0.5);
    
    // Change all shapes to WhatsApp green color
    animation.addEventListener('DOMLoaded', () => {
      const svgElement = container.querySelector('svg');
      if (svgElement) {
        // Target all possible SVG elements
        const allElements = svgElement.querySelectorAll('*');
        allElements.forEach(element => {
          // Set fill and stroke to WhatsApp green
          (element as SVGElement).style.fill = '#25D366';
          (element as SVGElement).style.stroke = '#25D366';
          (element as SVGElement).style.color = '#25D366';
          
          // Override any inline styles
          element.setAttribute('fill', '#25D366');
          element.setAttribute('stroke', '#25D366');
          element.setAttribute('color', '#25D366');
          
          // Override style attribute
          if (element.getAttribute('style')) {
            element.setAttribute('style', element.getAttribute('style')?.replace(/#[0-9a-fA-F]{3,6}/g, '#25D366') || 'fill:#25D366;stroke:#25D366;color:#25D366;');
          }
        });
        
        // Add CSS to override all colors within this specific animation only
        const style = document.createElement('style');
        style.textContent = `
          svg[data-whatsapp-animation] * {
            fill: #25D366 !important;
            stroke: #25D366 !important;
            color: #25D366 !important;
          }
        `;
        svgElement.setAttribute('data-whatsapp-animation', 'true');
        svgElement.appendChild(style);
      }
    });
    
    return () => {
      animation.destroy();
    };
  }, []);

return (
    <div
      ref={containerRef}
      className={className}
      style={size ? { width: size, height: size } : { width: 'auto', height: 'auto' }}
    />
  );
}
