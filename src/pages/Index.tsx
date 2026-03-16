import { useState } from 'react';
import { FileUploader } from '@/components/FileUploader';
import { ComparativeReport } from '@/components/ComparativeReport';
import { parseResidentFile } from '@/lib/parseResidentData';
import { compareResident, rankResidents } from '@/lib/compareResidents';
import { lookupPgy } from '@/lib/residentRoster';
import type { ResidentData, ResidentComparison } from '@/types/resident';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [residentData, setResidentData] = useState<ResidentData[]>([]);
  const [comparisons, setComparisons] = useState<ResidentComparison[]>([]);
  const { toast } = useToast();

  const handleFilesSelected = async (files: File[]) => {
    setIsLoading(true);
    
    try {
      const parsedData: ResidentData[] = [];
      
      for (const file of files) {
        try {
          const dataList = await parseResidentFile(file);
          for (const data of dataList) {
            data.pgy = lookupPgy(data.residentName);
            parsedData.push(data);
          }
        } catch (error) {
          console.error(`Error parsing ${file.name}:`, error);
          toast({
            title: 'Parsing Error',
            description: `Failed to parse ${file.name}. Please check the file format.`,
            variant: 'destructive',
          });
        }
      }
      
      if (parsedData.length > 0) {
        setResidentData(parsedData);
        
        const comparisonResults = parsedData.map(data => compareResident(data));
        const rankedResults = rankResidents(comparisonResults);
        setComparisons(rankedResults);
        
        toast({
          title: 'Files Processed',
          description: `Successfully processed ${parsedData.length} resident record${parsedData.length > 1 ? 's' : ''} from ${files.length} file${files.length > 1 ? 's' : ''}.`,
        });
      }
    } catch (error) {
      console.error('Error processing files:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while processing files.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResidentData([]);
    setComparisons([]);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-border shadow-sm flex items-center justify-center">
              <img src="/mgb.png" alt="MGB" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Residency Case Tracker</h1>
              <p className="text-sm text-muted-foreground">Neurological Surgery Minimum Requirements</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {comparisons.length === 0 ? (
          <div className="max-w-xl mx-auto">
            {/* Hero Section */}
            <div className="text-center mb-8 animate-fade-in">
              <h2 className="text-3xl font-bold text-foreground mb-3">
                Track Resident Progress
              </h2>
              <p className="text-muted-foreground">
                Compare resident performance against ACGME minimum requirements
              </p>
            </div>

            {/* File Uploader */}
            <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
              <FileUploader onFilesSelected={handleFilesSelected} isLoading={isLoading} />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Results Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Analysis Results</h2>
                <p className="text-muted-foreground">
                  {comparisons.length} resident{comparisons.length > 1 ? 's' : ''} analyzed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Upload New Files
                </button>
              </div>
            </div>

            {/* Comparative Report */}
            <ComparativeReport comparisons={comparisons} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Residency Case Tracker • Built for tracking ACGME minimum requirements
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
