import { useState } from 'react';
import { Activity, Users, FileBarChart } from 'lucide-react';
import { FileUploader } from '@/components/FileUploader';
import { ResidentCard } from '@/components/ResidentCard';
import { ComparativeReport } from '@/components/ComparativeReport';
import { parseResidentFile } from '@/lib/parseResidentData';
import { compareResident, rankResidents } from '@/lib/compareResidents';
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
          const data = await parseResidentFile(file);
          parsedData.push(data);
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
          description: `Successfully processed ${parsedData.length} resident file${parsedData.length > 1 ? 's' : ''}.`,
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
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <Activity className="w-6 h-6 text-primary-foreground" />
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
                Upload case log files to compare resident performance against ACGME minimum requirements
              </p>
            </div>

            {/* Stats Preview */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-card rounded-lg border border-border text-center animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <Users className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Multiple Residents</p>
              </div>
              <div className="p-4 bg-card rounded-lg border border-border text-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <FileBarChart className="w-6 h-6 text-accent mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">PDF & Excel</p>
              </div>
              <div className="p-4 bg-card rounded-lg border border-border text-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
                <Activity className="w-6 h-6 text-success mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Instant Analysis</p>
              </div>
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
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Upload New Files
              </button>
            </div>

            {/* Comparative Report (if multiple residents) */}
            {comparisons.length > 1 && (
              <ComparativeReport comparisons={comparisons} />
            )}

            {/* Individual Resident Cards */}
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Individual Reports</h3>
              <div className="space-y-4">
                {comparisons.map((comparison, index) => (
                  <ResidentCard
                    key={comparison.residentName}
                    comparison={comparison}
                    rank={comparisons.length > 1 ? index + 1 : undefined}
                  />
                ))}
              </div>
            </div>
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
