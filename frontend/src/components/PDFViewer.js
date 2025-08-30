import { useState, useEffect } from "react";
import { Hash, AlertCircle } from "lucide-react";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const PDFViewer = ({ selectedMeetingId, onPdfLoaded }) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedMeetingId) {
      setPdfBlobUrl(null);
      if (onPdfLoaded) onPdfLoaded(false);
      return;
    }

    const fetchPdfBlob = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const currentTime = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        });
        
        const response = await fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            generated_on: currentTime
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(blobUrl);
        if (onPdfLoaded) onPdfLoaded(true);
      } catch (err) {
        console.error('Error fetching PDF:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPdfBlob();

    // Cleanup function for when component unmounts or selectedMeetingId changes
    return () => {
      // This cleanup will run on next effect or unmount
      setPdfBlobUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        return null;
      });
    };
  }, [selectedMeetingId, onPdfLoaded]);

  if (!selectedMeetingId) {
    return (
      <div className="empty-state">
        <Hash className="empty-icon" />
        <p className="empty-title">No PDF available</p>
        <p className="empty-subtitle">PDF will be generated after processing audio</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pdf-loading-state">
        <div className="spinner"></div>
        <p>Loading PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pdf-error-state">
        <AlertCircle className="empty-icon" />
        <p className="empty-title">Failed to load PDF</p>
        <p className="empty-subtitle">{error}</p>
      </div>
    );
  }

  if (!pdfBlobUrl) {
    return (
      <div className="empty-state">
        <Hash className="empty-icon" />
        <p className="empty-title">No PDF available</p>
        <p className="empty-subtitle">PDF will be generated after processing audio</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-container">
      <iframe
        src={pdfBlobUrl}
        className="pdf-viewer"
        title="Meeting Summary PDF"
        width="100%"
        style={{ border: 'none', borderRadius: '8px' }}
      />
    </div>
  );
};

export default PDFViewer;