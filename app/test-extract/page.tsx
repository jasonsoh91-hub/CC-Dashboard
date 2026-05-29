'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestExtractPage() {
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTest = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: 'Failed to fetch' });
    } finally {
      setIsLoading(false);
    }
  };

  const sampleData = `Applicant details
Name: Tan Pai Joo
IC/Passport:730307016344
Residential Address:30, Jln Putra 1/5, Bandar Putra
Email address: peiyu037@hotmail.com
Contact number:012 7806816

Company name:Bumimas Food
Office Number : 07 9435866
Position: MD
Date joined:1998`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">API Extraction Test Page</h1>
        <p className="mb-6 text-slate-600">This page tests the extraction API directly, bypassing the main dashboard.</p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Input Data</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste customer data here..."
              className="min-h-[150px] font-mono text-sm"
            />
            <div className="flex gap-2 mt-4">
              <Button onClick={handleTest} disabled={isLoading}>
                {isLoading ? 'Testing...' : 'Test Extraction'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRawText(sampleData)}
              >
                Load Sample Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Extraction Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
