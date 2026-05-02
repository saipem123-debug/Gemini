import { useState, useCallback, useRef, useEffect } from 'react';

export function useVoiceInteraction(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const shouldBeActiveRef = useRef(false);

  const startListening = useCallback(async () => {
    if (isListening) return;
    shouldBeActiveRef.current = true;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      // Setup Visualizer (only if not already setup)
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        const updateVolume = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const avg = sum / dataArray.length;
            setVolume(avg / 128); // Normalize to 0-1
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          }
        };
        updateVolume();
      }

      // Setup Recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          onTranscript(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        // Silencing common non-critical errors to reduce console noise
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.warn("Speech recognition warning:", event.error);
        }
        
        if (event.error === 'not-allowed') {
          shouldBeActiveRef.current = false;
          stopListening();
        }
      };

      recognition.onend = () => {
        if (shouldBeActiveRef.current) {
          // Add a small delay then restart to ensure persistence
          setTimeout(() => {
            if (shouldBeActiveRef.current) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore if already started
              }
            }
          }, 100);
        } else {
          setIsListening(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (error) {
      console.error("Failed to start voice interaction:", error);
      shouldBeActiveRef.current = false;
    }
  }, [isListening, onTranscript]);

  const stopListening = useCallback(() => {
    shouldBeActiveRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsListening(false);
    setVolume(0);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    volume,
    startListening,
    stopListening
  };
}
