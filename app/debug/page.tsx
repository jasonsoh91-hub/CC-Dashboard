'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function DebugPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [step, setStep] = useState(1);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const testAPI = async () => {
    setStep(1);
    addLog('Step 1: Testing API endpoint...');

    const testData = `Applicant details
Name: Tan Pai Joo
IC/Passport:730307016344
Company name:Bumimas Food
Office Number : 07 9435866
Position: MD`;

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: testData }),
      });

      const result = await response.json();
      addLog(`API Response status: ${response.status}`);
      addLog(`API Response success: ${result.success}`);

      if (result.data) {
        addLog(`Extracted name: ${result.data.name}`);
        addLog(`Extracted employer_name: ${result.data.employer_name}`);
        addLog(`Extracted position: ${result.data.position}`);
        addLog(`Extracted office_phone: ${result.data.office_phone}`);
      }

      setStep(2);
      return result;
    } catch (error) {
      addLog(`ERROR: ${error}`);
      return null;
    }
  };

  const testBrowser = async () => {
    addLog('Step 2: Checking browser environment...');
    addLog(`User Agent: ${navigator.userAgent}`);
    addLog(`Cookies enabled: ${navigator.cookieEnabled}`);
    addLog(`Local Storage available: ${typeof Storage !== 'undefined'}`);

    // Check if service workers are registered
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      addLog(`Service Workers: ${registrations.length} registered`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
        <p className="mb-6 text-slate-400">This page helps diagnose extraction issues.</p>

        <div className="flex gap-4 mb-6">
          <Button onClick={testAPI} disabled={step !== 1}>
            Test API
          </Button>
          <Button onClick={testBrowser} variant="outline">
            Test Browser
          </Button>
          <Button onClick={clearLogs} variant="secondary">
            Clear Logs
          </Button>
        </div>

        <div className="bg-black p-4 rounded-lg font-mono text-sm max-h-96 overflow-auto">
          {logs.length === 0 ? (
            <p className="text-slate-500">Click "Test API" to begin...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={log.includes('ERROR') ? 'text-red-400' : 'text-green-400'}>
                {log}
              </div>
            ))
          )}
        </div>

        <div className="mt-6 p-4 bg-slate-800 rounded-lg">
          <h2 className="font-bold mb-2">Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300">
            <li>Click "Test API" to verify the backend is working</li>
            <li>Check if employer_name, position, and office_phone are extracted</li>
            <li>If API works but dashboard doesn't, it's a browser cache issue</li>
            <li>Try: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) to hard refresh</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
