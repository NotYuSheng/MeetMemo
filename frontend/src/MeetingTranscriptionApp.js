import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Download,
  FileText,
  Hash,
  Send,
  Trash2,
  CheckCircle,
  Users,
  Clock,
  Target,
  AlertCircle,
  Lightbulb,
  Star,
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Copy,
} from "lucide-react";
import "./MeetingTranscriptionApp.css";
import jsPDF from "jspdf";
import { useCallback } from "react";
import logger from "./utils/logger";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

const processTranscriptWithSpeakerIds = (transcriptData) => {
  const speakerMap = {};
  let speakerCounter = 1;
  return transcriptData.map((entry, idx) => {
    const speaker = entry.speaker ?? "SPEAKER_00";
    if (!speakerMap[speaker]) {
      speakerMap[speaker] = speakerCounter++;
    }
    return {
      id: idx,
      speaker: speaker,
      speakerId: speakerMap[speaker],
      text: entry.text,
      start: entry.start,
      end: entry.end,
    };
  });
};

// Shared content processing system for both web and PDF
const parseMarkdownContent = (markdownText) => {
  if (!markdownText) return [];
  
  const lines = markdownText.split('\n');
  const contentBlocks = [];
  let currentBlock = null;
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Detect headings
    if (trimmedLine.startsWith('# ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 1,
        content: trimmedLine.substring(2).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(2).trim(), 1)
      };
    } else if (trimmedLine.startsWith('## ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 2,
        content: trimmedLine.substring(3).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(3).trim(), 2)
      };
    } else if (trimmedLine.startsWith('### ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 3,
        content: trimmedLine.substring(4).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(4).trim(), 3)
      };
    } else if (trimmedLine.startsWith('#### ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 4,
        content: trimmedLine.substring(5).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(5).trim(), 4)
      };
    } else if (trimmedLine.startsWith('##### ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 5,
        content: trimmedLine.substring(6).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(6).trim(), 5)
      };
    } else if (trimmedLine.startsWith('###### ')) {
      if (currentBlock) contentBlocks.push(currentBlock);
      currentBlock = {
        type: 'heading',
        level: 6,
        content: trimmedLine.substring(7).trim(),
        rawLine: line,
        sectionType: getSectionType(trimmedLine.substring(7).trim(), 6)
      };
    } 
    // Detect list items (bulleted) - but check if it might be a header first
    else if (trimmedLine.match(/^[-*+]\s+/)) {
      const content = trimmedLine.replace(/^[-*+]\s+/, '');
      const indent = line.length - line.trimStart().length;
      
      // Check if this looks like a header (capitalized, short, doesn't end with punctuation)
      const isLikelyHeader = (
        content.length < 100 && // Reasonable header length
        content.charAt(0) === content.charAt(0).toUpperCase() && // Starts with capital
        !content.match(/\s(and|or|the|a|an|in|on|at|to|for|of|with|by)\s/i) && // Doesn't contain common mid-sentence words
        (content.split(' ').length <= 8) && // Not too many words for a header
        indent === 0 // No indentation
      );
      
      if (isLikelyHeader) {
        // Treat as heading
        if (currentBlock) contentBlocks.push(currentBlock);
        currentBlock = {
          type: 'heading',
          level: 3, // Treat bullet headers as H3
          content: content,
          rawLine: line,
          sectionType: getSectionType(content, 3)
        };
      } else {
        // Treat as list item
        if (!currentBlock || currentBlock.type !== 'list') {
          if (currentBlock) contentBlocks.push(currentBlock);
          currentBlock = {
            type: 'list',
            listType: 'bullet',
            items: [],
            rawLines: []
          };
        }
        currentBlock.items.push({ content, indent, formatted: parseInlineFormatting(content) });
        currentBlock.rawLines.push(line);
      }
    }
    // Detect numbered list items - but check if it might be a header first
    else if (trimmedLine.match(/^\d+\.\s+/)) {
      const content = trimmedLine.replace(/^\d+\.\s+/, '');
      const indent = line.length - line.trimStart().length;
      
      // Check if this looks like a header (capitalized, short, doesn't end with punctuation)
      const isLikelyHeader = (
        content.length < 100 && // Reasonable header length
        content.charAt(0) === content.charAt(0).toUpperCase() && // Starts with capital
        !content.match(/\s(and|or|the|a|an|in|on|at|to|for|of|with|by)\s/i) && // Doesn't contain common mid-sentence words
        (content.split(' ').length <= 8) && // Not too many words for a header
        indent === 0 // No indentation
      );
      
      if (isLikelyHeader) {
        // Treat as heading
        if (currentBlock) contentBlocks.push(currentBlock);
        currentBlock = {
          type: 'heading',
          level: 3, // Treat numbered headers as H3
          content: content,
          rawLine: line,
          sectionType: getSectionType(content, 3)
        };
      } else {
        // Treat as list item
        if (!currentBlock || currentBlock.type !== 'list') {
          if (currentBlock) contentBlocks.push(currentBlock);
          currentBlock = {
            type: 'list',
            listType: 'number',
            items: [],
            rawLines: []
          };
        }
        currentBlock.items.push({ content, indent, formatted: parseInlineFormatting(content) });
        currentBlock.rawLines.push(line);
      }
    }
    // Detect code blocks
    else if (trimmedLine.startsWith('```')) {
      if (!currentBlock || currentBlock.type !== 'codeblock') {
        if (currentBlock) contentBlocks.push(currentBlock);
        currentBlock = {
          type: 'codeblock',
          language: trimmedLine.substring(3).trim(),
          content: [],
          rawLines: []
        };
      } else {
        // End of code block
        if (currentBlock) contentBlocks.push(currentBlock);
        currentBlock = null;
      }
    }
    // Detect blockquotes
    else if (trimmedLine.startsWith('> ')) {
      const content = trimmedLine.substring(2);
      if (!currentBlock || currentBlock.type !== 'blockquote') {
        if (currentBlock) contentBlocks.push(currentBlock);
        currentBlock = {
          type: 'blockquote',
          content: [],
          rawLines: []
        };
      }
      currentBlock.content.push(parseInlineFormatting(content));
      currentBlock.rawLines.push(line);
    }
    // Regular paragraph or content
    else if (trimmedLine) {
      if (currentBlock && currentBlock.type === 'codeblock') {
        currentBlock.content.push(line);
        currentBlock.rawLines.push(line);
      } else {
        if (!currentBlock || currentBlock.type !== 'paragraph') {
          if (currentBlock) contentBlocks.push(currentBlock);
          currentBlock = {
            type: 'paragraph',
            content: [],
            rawLines: []
          };
        }
        currentBlock.content.push(parseInlineFormatting(trimmedLine));
        currentBlock.rawLines.push(line);
      }
    }
    // Empty lines
    else {
      if (currentBlock) {
        contentBlocks.push(currentBlock);
        currentBlock = null;
      }
    }
  });
  
  if (currentBlock) {
    contentBlocks.push(currentBlock);
  }
  
  return contentBlocks;
};

// Parse inline formatting (bold, italic, code, links)
const parseInlineFormatting = (text) => {
  return {
    raw: text,
    html: text
      // Bold **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic *text* or _text_
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
      // Code `text`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  };
};

// Get section type (reuse existing logic)
const getSectionType = (content, level) => {
  const text = String(content).toLowerCase();
  
  if (level <= 2) {
    if (text.includes('action') || text.includes('tasks') || text.includes('todo')) return 'actions';
    if (text.includes('decision') || text.includes('outcome')) return 'decisions';
    if (text.includes('participant') || text.includes('attendee')) return 'participants';
    if (text.includes('discussion') || text.includes('topic')) return 'discussion';
    if (text.includes('key point') || text.includes('highlight')) return 'highlights';
    if (text.includes('next step') || text.includes('follow up')) return 'next-steps';
    if (text.includes('issue') || text.includes('concern') || text.includes('risk')) return 'issues';
    if (text.includes('idea') || text.includes('suggestion') || text.includes('insight')) return 'ideas';
    if (text.includes('summary') || text.includes('overview')) return 'summary';
  }
  
  return 'default';
};

// Content validation function - ensures web and PDF show identical content
const validateContentParity = (markdownText) => {
  const contentBlocks = parseMarkdownContent(markdownText);
  const validation = {
    totalBlocks: contentBlocks.length,
    headings: contentBlocks.filter(b => b.type === 'heading').length,
    paragraphs: contentBlocks.filter(b => b.type === 'paragraph').length,
    lists: contentBlocks.filter(b => b.type === 'list').length,
    codeblocks: contentBlocks.filter(b => b.type === 'codeblock').length,
    blockquotes: contentBlocks.filter(b => b.type === 'blockquote').length,
    sections: {},
    wordCount: 0
  };
  
  // Count section types and total words
  contentBlocks.forEach(block => {
    if (block.type === 'heading' && block.sectionType) {
      validation.sections[block.sectionType] = (validation.sections[block.sectionType] || 0) + 1;
    }
    
    // Count words in different block types
    if (block.content) {
      if (typeof block.content === 'string') {
        validation.wordCount += block.content.split(/\s+/).length;
      } else if (Array.isArray(block.content)) {
        block.content.forEach(item => {
          const text = item.raw || item.html || String(item);
          validation.wordCount += text.replace(/<[^>]*>/g, '').split(/\s+/).length;
        });
      }
    }
  });
  
  return validation;
};

// Icon mapping for different formats
const getIconsForFormat = (sectionType, format = 'web') => {
  const iconMaps = {
    web: {
      // Beautiful emojis for web display
      actions: '✅', decisions: '🎯', issues: '⚠️', 
      highlights: '⭐', 'next-steps': '⏭️', participants: '👥',
      summary: '📋', ideas: '💡', discussion: '💬', default: '📌'
    },
    pdf: {
      // Same emojis for PDF - we'll convert them to images
      actions: '✅', decisions: '🎯', issues: '⚠️', 
      highlights: '⭐', 'next-steps': '⏭️', participants: '👥',
      summary: '📋', ideas: '💡', discussion: '💬', default: '📌'
    }
  };
  
  return iconMaps[format][sectionType] || iconMaps[format].default;
};

// Convert emoji to image data for PDF embedding
const emojiToImageData = async (emoji, size = 16) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = size;
    canvas.height = size;
    
    // Set font and styling
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Clear background
    ctx.clearRect(0, 0, size, size);
    
    // Draw emoji
    ctx.fillText(emoji, size / 2, size / 2);
    
    // Convert to image data
    const imageData = canvas.toDataURL('image/png');
    resolve(imageData);
  });
};

// Custom ReactMarkdown components with icons
const getHeadingIcon = (children, level) => {
  const text = String(children).toLowerCase();
  
  // Level 1 headings (main sections)
  if (level === 1) {
    if (text.includes('summary') || text.includes('overview')) return FileText;
    if (text.includes('agenda')) return Calendar;
    return Hash;
  }
  
  // Level 2 headings (subsections)  
  if (level === 2) {
    if (text.includes('action') || text.includes('tasks') || text.includes('todo')) return CheckCircle;
    if (text.includes('decision') || text.includes('outcome')) return Target;
    if (text.includes('participant') || text.includes('attendee')) return Users;
    if (text.includes('discussion') || text.includes('topic')) return MessageSquare;
    if (text.includes('key point') || text.includes('highlight')) return Star;
    if (text.includes('next step') || text.includes('follow up')) return Clock;
    if (text.includes('issue') || text.includes('concern') || text.includes('risk')) return AlertCircle;
    if (text.includes('idea') || text.includes('suggestion') || text.includes('insight')) return Lightbulb;
    return Hash;
  }
  
  // Level 3+ headings
  return Hash;
};

const getSectionStyle = (sectionType, level) => {
  if (level <= 2) {
    switch (sectionType) {
      case 'actions': return 'summary-section-actions';
      case 'decisions': return 'summary-section-decisions';
      case 'participants': return 'summary-section-participants';
      case 'highlights': return 'summary-section-highlights';
      case 'issues': return 'summary-section-issues';
      case 'next-steps': return 'summary-section-next-steps';
      case 'ideas': return 'summary-section-ideas';
      case 'discussion': return 'summary-section-discussion';
      default: return 'summary-section-default';
    }
  }
  return 'summary-section-default';
};

// Extract AI-generated title from summary markdown
const extractTitleFromSummary = (summaryText) => {
  if (!summaryText) return null;
  
  // Look for the first # heading in the summary
  const lines = summaryText.split('\n');
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
};

// Collapsible Section Component
const CollapsibleSection = ({ isCollapsed, onToggle, children }) => {
  return (
    <div className={`collapsible-section ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {children}
    </div>
  );
};

const CustomHeading = ({ level, children, sectionType, ...props }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const HeadingTag = `h${level}`;
  const IconComponent = getHeadingIcon(children, level);
  const sectionClass = getSectionStyle(sectionType || getSectionType(children, level), level);
  const headingId = `heading-${String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`;
  
  const toggleCollapse = () => {
    if (level === 2) { // Only make H2 sections collapsible
      setIsCollapsed(!isCollapsed);
      
      // Find and toggle the next sibling elements until the next heading
      const heading = document.getElementById(headingId);
      if (heading) {
        let nextElement = heading.nextElementSibling;
        while (nextElement && !nextElement.tagName.match(/^H[1-6]$/)) {
          nextElement.style.display = isCollapsed ? 'block' : 'none';
          nextElement = nextElement.nextElementSibling;
        }
      }
    }
  };

  const copySection = async () => {
    const heading = document.getElementById(headingId);
    if (heading) {
      let sectionText = heading.textContent + '\n\n';
      let nextElement = heading.nextElementSibling;
      
      while (nextElement && !nextElement.tagName.match(/^H[1-6]$/)) {
        if (nextElement.style.display !== 'none') {
          sectionText += nextElement.textContent + '\n';
        }
        nextElement = nextElement.nextElementSibling;
      }
      
      try {
        await navigator.clipboard.writeText(sectionText.trim());
        // You could add a toast notification here
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };
  
  return (
    <HeadingTag 
      {...props} 
      id={headingId}
      className={`custom-heading ${sectionClass} ${level === 2 ? 'collapsible-heading' : ''}`}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        cursor: level === 2 ? 'pointer' : 'default'
      }}
    >
      {level === 2 && (
        <button 
          onClick={toggleCollapse}
          className="collapse-toggle"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
      <IconComponent size={level === 1 ? 22 : level === 2 ? 20 : 18} />
      <span onClick={level === 2 ? toggleCollapse : undefined} style={{ flex: 1 }}>
        <span style={{ marginRight: '0.5rem' }}>
          {getIconsForFormat(sectionType || getSectionType(children, level), 'web')}
        </span>
        {children}
      </span>
      {level === 2 && (
        <button 
          onClick={copySection}
          className="copy-section-btn"
          aria-label="Copy section to clipboard"
          title="Copy section to clipboard"
        >
          <Copy size={14} />
        </button>
      )}
    </HeadingTag>
  );
};

// Render parsed content blocks as React elements
const ContentRenderer = ({ contentBlocks }) => {
  if (!contentBlocks || contentBlocks.length === 0) {
    return <div>No content available</div>;
  }

  const renderInlineFormatting = (formatted) => {
    if (!formatted || !formatted.html) return formatted?.raw || formatted || '';
    
    return <span dangerouslySetInnerHTML={{ __html: formatted.html }} />;
  };

  return (
    <div className="content-renderer">
      {contentBlocks.map((block, index) => {
        const key = `block-${index}`;
        
        switch (block.type) {
          case 'heading':
            return (
              <CustomHeading 
                key={key}
                level={block.level} 
                sectionType={block.sectionType}
              >
                {block.content}
              </CustomHeading>
            );
            
          case 'paragraph':
            return (
              <p key={key} className="content-paragraph">
                {block.content.map((item, pIndex) => (
                  <span key={`p-${pIndex}`}>
                    {renderInlineFormatting(item)}
                    {pIndex < block.content.length - 1 && ' '}
                  </span>
                ))}
              </p>
            );
            
          case 'list':
            const ListTag = block.listType === 'bullet' ? 'ul' : 'ol';
            return (
              <ListTag key={key} className="content-list">
                {block.items.map((item, liIndex) => (
                  <li key={`li-${liIndex}`} style={{ marginLeft: `${item.indent || 0}px` }}>
                    {renderInlineFormatting(item.formatted)}
                  </li>
                ))}
              </ListTag>
            );
            
          case 'blockquote':
            return (
              <blockquote key={key} className="content-blockquote">
                {block.content.map((item, bqIndex) => (
                  <p key={`bq-${bqIndex}`}>
                    {renderInlineFormatting(item)}
                  </p>
                ))}
              </blockquote>
            );
            
          case 'codeblock':
            return (
              <pre key={key} className="content-codeblock">
                <code className={block.language ? `language-${block.language}` : ''}>
                  {block.content.join('\n')}
                </code>
              </pre>
            );
            
          default:
            return null;
        }
      })}
    </div>
  );
};

const customComponents = {
  h1: (props) => <CustomHeading level={1} {...props} />,
  h2: (props) => <CustomHeading level={2} {...props} />,
  h3: (props) => <CustomHeading level={3} {...props} />,
  h4: (props) => <CustomHeading level={4} {...props} />,
  h5: (props) => <CustomHeading level={5} {...props} />,
  h6: (props) => <CustomHeading level={6} {...props} />,
};

const MeetingTranscriptionApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const audioPlayerRef = useRef(null);
  const uploadPlayerRef = useRef(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing audio with AI...");
  const [selectedFile, setSelectedFile] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);
  const [meetingList, setMeetingList] = useState([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showPromptInputs, setShowPromptInputs] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const speakerColorMap = useRef({});
  const [selectedModel, setSelectedModel] = useState("turbo");
  const [speakerNameMap, setSpeakerNameMap] = useState({});
  const speakerNameMapRef = useRef(speakerNameMap);
  useEffect(() => {
    speakerNameMapRef.current = speakerNameMap;
  }, [speakerNameMap]);

  // Initialize particles.js
  useEffect(() => {
    if (window.particlesJS) {
      window.particlesJS("particles-js", {
        particles: {
          number: {
            value: 80,
            density: {
              enable: true,
              value_area: 800,
            },
          },
          color: {
            value: ["#2998D5", "#265289", "#75797C", "#bba88e", "#FFFFFF"],
          },
          shape: {
            type: "circle",
            stroke: {
              width: 0,
              color: "#000000",
            },
          },
          opacity: {
            value: 0.9,
            random: false,
            anim: {
              enable: false,
              speed: 1,
              opacity_min: 0.7,
              sync: false,
            },
          },
          size: {
            value: 3,
            random: true,
            anim: {
              enable: false,
              speed: 40,
              size_min: 0.1,
              sync: false,
            },
          },
          line_linked: {
            enable: true,
            distance: 150,
            color: "#8a7c6b",
            opacity: 0.8,
            width: 2.5,
          },
          move: {
            enable: true,
            speed: 2,
            direction: "none",
            random: false,
            straight: false,
            out_mode: "out",
            bounce: false,
            attract: {
              enable: false,
              rotateX: 600,
              rotateY: 1200,
            },
          },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: {
              enable: true,
              mode: "repulse",
            },
            onclick: {
              enable: true,
              mode: "push",
            },
            resize: true,
          },
          modes: {
            grab: {
              distance: 400,
              line_linked: {
                opacity: 1,
              },
            },
            bubble: {
              distance: 400,
              size: 40,
              duration: 2,
              opacity: 8,
              speed: 3,
            },
            repulse: {
              distance: 200,
              duration: 0.4,
            },
            push: {
              particles_nb: 4,
            },
            remove: {
              particles_nb: 2,
            },
          },
        },
        retina_detect: true,
      });
    }
  }, [isDarkMode]);
  const [editingSpeaker, setEditingSpeaker] = useState(null);
  const [, setIsSavingNames] = useState(false);

  const truncateFileName = (name, maxLength = 35) => {
    if (!name) return "";
    return name.length > maxLength
      ? name.slice(0, maxLength).trim() + "..."
      : name;
  };

  const handleSpeakerNameChange = (oldName, newName) => {
    if (!newName || oldName === newName) return;
    setTranscript((prevTranscript) =>
      prevTranscript.map((entry) =>
        entry.speaker === oldName ? { ...entry, speaker: newName } : entry,
      ),
    );
    setSpeakerNameMap((prev) => ({
      ...prev,
      [oldName]: newName,
    }));
    handleSubmitSpeakerNames();
  };

  const handleSubmitSpeakerNames = () => {
    if (!selectedMeetingId) {
      alert("No meeting is selected.");
      return;
    }
    setIsSavingNames(true);
    const currentSpeakerNameMap = speakerNameMapRef.current;

    fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/speakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: currentSpeakerNameMap }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to update speaker names");
        return res.json();
      })
      .then(() => {
        setIsRenaming(false);
      })
      .catch((err) => {
        logger.apiError(`/jobs/${selectedMeetingId}/speakers`, err, { mapping: currentSpeakerNameMap });
        alert("An error occurred while saving the new names.");
      })
      .finally(() => {
        setIsSavingNames(false);
      });
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
    document.documentElement.setAttribute(
      "data-theme",
      !isDarkMode ? "dark" : "light",
    );
  };

  const loadPastMeeting = (uuid) => {
    setTranscript([]);
    setSummary(null);
    setSelectedMeetingId(uuid);
    speakerColorMap.current = {};
    setSummaryLoading(true);

    fetch(`${API_BASE_URL}/jobs/${uuid}/transcript`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = JSON.parse(data.full_transcript || "[]");
        setTranscript(processTranscriptWithSpeakerIds(parsed));
        return fetch(`${API_BASE_URL}/jobs/${uuid}/summarise`, {
          method: "POST",
        });
      })
      .then((res) => res.json())
      .then((data) => {
        const aiTitle = extractTitleFromSummary(data.summary);
        setSummary({
          meetingTitle: aiTitle || data.fileName,
          summary: data.summary,
        });
      })
      .catch((err) => {
        logger.apiError(`/jobs/${uuid}/transcript`, err);
        console.error("Failed to load past meeting", err);
      })
      .finally(() => setSummaryLoading(false));
  };

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const handleRename = () => {
    if (!selectedMeetingId) return;

    fetch(
      `${API_BASE_URL}/jobs/${selectedMeetingId}/rename?new_name=${newName}`,
      { method: "PATCH" },
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setSummary((prev) => ({ ...prev, meetingTitle: newName }));
          fetchMeetingList();
          setIsRenaming(false);
        }
      })
      .catch((err) => {
        logger.apiError(`/jobs/${selectedMeetingId}/rename`, err, { new_name: newName });
        console.error("Failed to rename meeting", err);
      });
  };

  const startRecording = async () => {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia is not supported in this browser. Please use a modern browser or enable microphone permissions.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        setRecordedAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setRecordingTime(0);
      setIsRecording(true);
    } catch (error) {
      logger.error("Failed to start audio recording", error, { userAgent: navigator.userAgent });
      console.error("Error starting recording:", error);
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to access microphone. ";
      
      if (error.name === "NotAllowedError") {
        errorMessage += "Please allow microphone access in your browser settings and try again.";
      } else if (error.name === "NotFoundError") {
        errorMessage += "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === "NotSupportedError") {
        errorMessage += "Your browser doesn't support audio recording. Please use Chrome, Firefox, or Safari.";
      } else if (error.name === "NotReadableError") {
        errorMessage += "Microphone is already in use by another application.";
      } else if (error.message.includes("getUserMedia")) {
        errorMessage += "Please use HTTPS or localhost to access the microphone.";
      } else {
        errorMessage += error.message;
      }
      
      alert(errorMessage);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
  };

  // Set audio source when recordedAudio changes
  useEffect(() => {
    if (recordedAudio && audioPlayerRef.current) {
      const audioUrl = URL.createObjectURL(recordedAudio);
      audioPlayerRef.current.src = audioUrl;

      return () => {
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [recordedAudio]);

  // Set audio source when selectedFile changes
  useEffect(() => {
    if (selectedFile && uploadPlayerRef.current) {
      const audioUrl = URL.createObjectURL(selectedFile);
      uploadPlayerRef.current.src = audioUrl;

      return () => {
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [selectedFile]);

  const processRecordedAudio = () => {
    if (recordedAudio) {
      processAudio(recordedAudio);
      setRecordedAudio(null); // Clear the recorded audio after processing
    }
  };

  const discardRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const discardUpload = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const pollJobStatus = async (uuid, maxAttempts = 60) => {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Update loading text to show progress
        if (attempt === 0) {
          setLoadingText("Starting audio processing...");
        } else if (attempt < 10) {
          setLoadingText("Processing audio with AI...");
        } else if (attempt < 30) {
          setLoadingText("AI is transcribing your audio...");
        } else {
          setLoadingText("Almost done, finalizing transcript...");
        }
        
        const response = await fetch(`${API_BASE_URL}/jobs/${uuid}/status`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const statusData = await response.json();
        
        // Reset error counter on successful request
        consecutiveErrors = 0;

        if (statusData.status === "completed") {
          // Job completed, fetch transcript
          const transcriptResponse = await fetch(
            `${API_BASE_URL}/jobs/${uuid}/transcript`,
          );
          const transcriptData = await transcriptResponse.json();

          if (transcriptData.full_transcript) {
            const parsed = JSON.parse(transcriptData.full_transcript || "[]");
            setTranscript(processTranscriptWithSpeakerIds(parsed));
            setSelectedMeetingId(uuid);
            fetchSummary(uuid);
            fetchMeetingList();
            return true;
          }
        } else if (
          statusData.status === "failed" ||
          statusData.status === "error"
        ) {
          throw new Error(statusData.error_message || "Job processing failed");
        }

        // Job still processing, wait and retry
        console.log(`Job ${uuid} still processing... (attempt ${attempt + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
      } catch (error) {
        consecutiveErrors++;
        logger.apiError(`/jobs/${uuid}/status`, error, { attempt, maxAttempts, consecutiveErrors });
        console.warn(`Error polling job status (attempt ${attempt + 1}/${maxAttempts}, consecutive errors: ${consecutiveErrors}):`, error);
        
        // Only throw error if we've had too many consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Network error during job polling: ${error.message}`);
        }
        
        // Wait longer before retrying after an error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    throw new Error("Job polling timeout - processing took too long");
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    speakerColorMap.current = {};
    setLoading(true);
    setLoadingText("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      // Check if the response indicates success and has expected data
      if (data.error || (!data.uuid && !data.transcript)) {
        throw new Error(data.error || "Invalid response from server");
      }

      // If we get a transcript immediately, use it
      if (data.transcript && Array.isArray(data.transcript)) {
        setTranscript(processTranscriptWithSpeakerIds(data.transcript));
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error("No transcript or job ID returned");
      }

      setSelectedFile(null);
    } catch (err) {
      logger.error("Failed to process uploaded file", err, { fileName: selectedFile?.name });
      console.error("Failed to process uploaded file:", err);
      alert(`Failed to process file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    setLoadingText("Uploading recording...");

    try {
      const formData = new FormData();
      formData.append("file", audioBlob);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      // Check if the response indicates success and has expected data
      if (data.error || (!data.uuid && !data.transcript)) {
        throw new Error(data.error || "Invalid response from server");
      }

      // If we get a transcript immediately, use it
      if (data.transcript && Array.isArray(data.transcript)) {
        setTranscript(processTranscriptWithSpeakerIds(data.transcript));
        setSelectedMeetingId(data.uuid);
        fetchSummary(data.uuid);
        fetchMeetingList();
      } else if (data.uuid) {
        // Otherwise, poll for status
        await pollJobStatus(data.uuid);
      } else {
        throw new Error("No transcript or job ID returned");
      }
    } catch (err) {
      logger.error("Failed to process recorded audio", err, { audioSize: audioBlob?.size });
      console.error("Failed to process recorded audio:", err);
      alert(`Failed to process recording: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchMeetingList = () => {
    fetch(`${API_BASE_URL}/jobs`)
      .then((res) => res.json())
      .then((data) => {
        const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
          uuid,
          name: info.file_name,
        }));
        setMeetingList(list);
      })
      .catch((err) => {
        logger.apiError("/jobs", err);
        console.error("Failed to fetch meeting list", err);
      });
  };

  const fetchSummary = (uuid, forceRegenerate = false) => {
    setSummaryLoading(true);

    const generateSummary = () => {
      // Prepare request body with custom prompts if provided
      const requestBody = {};
      if (customPrompt.trim()) {
        requestBody.custom_prompt = customPrompt.trim();
      }
      if (systemPrompt.trim()) {
        requestBody.system_prompt = systemPrompt.trim();
      }

      const requestOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };

      // Only add body if we have custom prompts
      if (Object.keys(requestBody).length > 0) {
        requestOptions.body = JSON.stringify(requestBody);
      }

      fetch(`${API_BASE_URL}/jobs/${uuid}/summarise`, requestOptions)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.summary) {
            const aiTitle = extractTitleFromSummary(data.summary);
            setSummary({
              meetingTitle: aiTitle || data.fileName,
              summary: data.summary,
            });
          }
        })
        .catch((err) => {
          logger.apiError(`/jobs/${uuid}/summarise`, err, requestBody);
          console.error("Failed to fetch summary", err);
        })
        .finally(() => setSummaryLoading(false));
    };

    if (forceRegenerate) {
      // First delete the cached summary, then generate a new one
      fetch(`${API_BASE_URL}/jobs/${uuid}/summary`, {
        method: "DELETE",
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("Summary deletion result:", data);
          // Generate new summary regardless of deletion result
          generateSummary();
        })
        .catch((err) => {
          logger.apiError(`/jobs/${uuid}/summary`, err);
          console.error("Failed to delete cached summary", err);
          // Still try to generate new summary even if deletion failed
          generateSummary();
        });
    } else {
      // Normal fetch - will return cached if available
      generateSummary();
    }
  };

  const handleDeleteMeeting = (uuid) => {
    if (!window.confirm("Are you sure you want to delete this meeting?"))
      return;

    fetch(`${API_BASE_URL}/jobs/${uuid}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to delete meeting");
        setMeetingList((prev) => prev.filter((m) => m.uuid !== uuid));
        if (selectedMeetingId === uuid) {
          setTranscript([]);
          setSummary(null);
          setSelectedMeetingId(null);
        }
      })
      .catch((err) => {
        logger.apiError(`/jobs/${uuid}`, err, { method: 'DELETE' });
        console.error("Delete failed:", err);
      });
  };

  const exportToPDF = async () => {
    if (!summary) return;
    
    // Parse content using our unified parser
    const contentBlocks = parseMarkdownContent(summary.summary);
    
    const doc = new jsPDF({ 
      unit: "pt", 
      format: "a4",
      putOnlyUsedFonts: true,
      compress: true
    });
    
    // Set default font to ensure ASCII characters render properly
    doc.setFont("helvetica", "normal");
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;
    
    // Load logo image data
    const logoImageData = await new Promise((resolve) => {
      try {
        // Create a canvas to render SVG as image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        // SVG content as data URI with the MeetMemo brand colors
        const svgData = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 336 336" width="40" height="40">
          <path fill="#ffffff" opacity="1.000000" stroke="none" d="M177.747375,243.805908 C187.551575,241.301575 197.013290,238.972092 206.908539,236.535873 C204.759552,235.384598 204.424896,234.538498 206.484528,233.528259 C212.344498,230.654022 217.545486,226.736145 222.800049,222.924042 C226.764954,220.047577 230.801468,217.213058 233.987167,212.706787 C231.110565,213.523422 229.964417,216.416870 227.391235,216.342590 C270.326691,171.020096 275.153503,123.156799 237.025314,72.363441 C208.287735,43.867672 174.722794,33.016499 135.331573,45.502388 C101.301178,56.289051 66.757080,90.920616 66.988014,143.659973 C64.010902,142.756012 62.900990,140.794342 63.083389,137.876831 C63.311653,134.225845 63.604523,130.573563 63.666595,126.918396 C64.074638,102.891487 75.006737,83.385185 90.650024,66.328651 C107.063400,48.432461 127.628914,37.923756 151.837524,34.549519 C199.599701,27.892355 244.227371,54.204498 262.365082,94.030251 C289.743286,154.145752 261.283630,225.271652 195.461365,244.490952 C187.299316,246.874176 178.813599,249.559479 170.474350,248.045975 C163.230560,246.731262 155.755524,246.989639 147.830627,244.607788 C152.871735,242.437286 157.198074,245.701920 161.380615,244.358170 C166.695435,242.650650 172.098038,245.493088 177.747375,243.805908 z"/>
          <path fill="#ffffff" opacity="1.000000" stroke="none" d="M144.557846,100.642075 C144.454010,96.865738 144.634216,93.491203 144.084503,90.240089 C143.365341,85.986664 141.712006,85.504791 138.435089,88.324097 C133.134125,92.884796 129.809021,98.978676 126.787552,105.045654 C116.444420,125.814163 111.866333,147.922363 112.155304,171.127670 C112.202446,174.912796 114.405891,177.919022 114.877113,181.637314 C111.994888,182.634949 111.038200,180.748596 110.131523,179.023773 C108.383972,175.699295 107.897812,171.935760 107.881264,168.363571 C107.747765,139.552032 114.372986,112.664459 131.397156,88.912643 C132.639359,87.179527 134.204468,85.583191 135.896622,84.284348 C141.749985,79.791504 146.205811,81.709770 147.535187,88.917953 C149.409729,99.082161 147.860092,109.154007 146.834869,119.204338 C145.639740,130.920135 143.869629,142.576889 142.405411,154.266312 C142.268204,155.361633 142.535324,156.507584 142.657623,158.236557 C145.376160,156.624207 146.116531,154.161026 147.331223,152.153656 C162.807449,126.577873 180.049973,102.315323 200.657288,80.573273 C205.353470,75.618507 210.243698,70.809212 216.784744,68.197105 C221.105011,66.471832 223.820969,67.664108 225.196075,72.121109 C227.106186,78.312141 226.704437,84.716255 226.050522,90.965324 C221.744995,132.110748 212.297729,172.156769 199.741058,211.511856 C199.265366,213.002762 199.308594,214.937897 197.065948,215.393448 C194.808594,214.103424 196.017517,212.266876 196.444916,210.635620 C203.393860,184.112762 210.527023,157.618393 215.009399,130.542145 C217.715836,114.193642 221.315155,97.934174 221.656311,81.263908 C221.704605,78.905289 222.638092,75.839195 219.734573,74.567993 C217.104919,73.416687 214.959824,75.534653 212.996735,76.953629 C202.474777,84.559181 194.424042,94.592728 186.444733,104.631073 C173.057159,121.473297 161.445831,139.571411 149.607147,157.502899 C149.240143,158.058792 148.942459,158.670547 148.517242,159.176193 C146.672485,161.369919 145.541000,165.372055 141.916855,164.165176 C138.090225,162.890884 138.424927,158.826523 138.759598,155.563950 C140.198990,141.531586 141.797073,127.515121 143.403503,113.500443 C143.876587,109.373245 143.227066,105.148659 144.557846,100.642075 z"/>
        </svg>`;
        
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = () => {
          canvas.width = 40;
          canvas.height = 40;
          ctx.drawImage(img, 0, 0, 40, 40);
          
          const imageData = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(imageData);
        };
        
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        
        img.src = url;
      } catch (error) {
        console.warn('Could not load logo for PDF:', error);
        resolve(null);
      }
    });
    
    // Pre-generate emoji images for PDF
    const emojiImageCache = {};
    const allEmojis = ['✅', '🎯', '⚠️', '⭐', '⏭️', '👥', '📋', '💡', '💬', '📌'];
    
    console.log('🎨 Converting emojis to images for PDF...');
    for (const emoji of allEmojis) {
      try {
        emojiImageCache[emoji] = await emojiToImageData(emoji, 16);
      } catch (error) {
        console.warn(`Could not convert emoji ${emoji} to image:`, error);
        emojiImageCache[emoji] = null;
      }
    }
    console.log('✅ Emoji images ready for PDF');
    
    // Color scheme for sections (matching web UI)
    const sectionColors = {
      actions: [34, 197, 94],      // Green
      decisions: [59, 130, 246],   // Blue  
      issues: [239, 68, 68],       // Red
      highlights: [245, 158, 11],  // Amber
      'next-steps': [139, 92, 246], // Purple
      participants: [6, 182, 212], // Cyan
      default: [41, 152, 213]      // Primary blue
    };
    
    // Helper function to add page breaks
    const checkPageBreak = (requiredHeight) => {
      if (y + requiredHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };
    
    // Helper function to render text with HTML formatting
    const renderFormattedText = (formatted, x, currentY, maxWidth, fontSize = 12) => {
      const html = formatted.html || formatted.raw || formatted;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const textContent = tempDiv.textContent || tempDiv.innerText || html;
      
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", 'normal');
      
      // Handle bold text (approximate by using bold font)
      if (html.includes('<strong>') || html.includes('<b>')) {
        doc.setFont("helvetica", 'bold');
      }
      
      const wrapped = doc.splitTextToSize(textContent, maxWidth);
      const lineHeight = fontSize * 1.2;
      
      wrapped.forEach((line, index) => {
        checkPageBreak(lineHeight);
        doc.text(line, x, currentY + (index * lineHeight));
      });
      
      return currentY + (wrapped.length * lineHeight);
    };
    
    // Title section with modern styling and logo
    checkPageBreak(60);
    doc.setFillColor(41, 152, 213);
    doc.rect(margin, y - 10, pageWidth - 2 * margin, 40, 'F');
    
    // Add logo to header if loaded successfully
    if (logoImageData) {
      doc.addImage(logoImageData, 'PNG', pageWidth - margin - 50, y - 5, 35, 35);
    }
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", 'bold');
    doc.text("MeetMemo - Meeting Summary", margin + 10, y + 15);
    y += 50;
    
    // Meeting title
    if (summary.meetingTitle) {
      doc.setTextColor(41, 152, 213);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      checkPageBreak(25);
      doc.text(`≡ ${summary.meetingTitle}`, margin, y);
      y += 30;
    }
    
    // Reset text color for content
    doc.setTextColor(0, 0, 0);
    
    // Process each content block
    contentBlocks.forEach((block, blockIndex) => {
      const isLastBlock = blockIndex === contentBlocks.length - 1;
      
      switch (block.type) {
        case 'heading':
          const sectionColor = sectionColors[block.sectionType] || sectionColors.default;
          
          // Add spacing before headings (except first)
          if (blockIndex > 0) {
            y += 20;
          }
          
          checkPageBreak(30 + (6 - block.level) * 5);
          
          // Colored bar for sections
          if (block.level <= 2) {
            doc.setFillColor(...sectionColor);
            doc.rect(margin - 5, y - 5, 4, 20, 'F');
          }
          
          // Heading text
          doc.setTextColor(...sectionColor);
          const headingSize = Math.max(14, 20 - (block.level * 2));
          doc.setFontSize(headingSize);
          doc.setFont("helvetica", 'bold');
          
          // Add section icon using our dual format system
          const icon = getIconsForFormat(block.sectionType, 'pdf');
          const emojiImage = emojiImageCache[icon];
          
          // Add emoji as image if available, otherwise use text
          if (emojiImage) {
            doc.addImage(emojiImage, 'PNG', margin, y + 2, 14, 14);
            doc.text(block.content, margin + 18, y + 15);
          } else {
            doc.text(`${icon} ${block.content}`, margin, y + 15);
          }
          
          y += 25 + (6 - block.level) * 2;
          break;
          
        case 'paragraph':
          checkPageBreak(40);
          doc.setTextColor(0, 0, 0);
          
          block.content.forEach(contentItem => {
            y = renderFormattedText(contentItem, margin, y, pageWidth - 2 * margin, 11) + 5;
          });
          
          if (!isLastBlock) y += 10;
          break;
          
        case 'list':
          checkPageBreak(30);
          doc.setTextColor(0, 0, 0);
          
          block.items.forEach((item, itemIndex) => {
            const bullet = block.listType === 'bullet' ? '•' : `${itemIndex + 1}.`;
            const indent = margin + 15 + (item.indent || 0);
            
            checkPageBreak(18);
            
            // Render bullet/number
            doc.setFontSize(11);
            doc.setFont("helvetica", 'bold');
            doc.setTextColor(41, 152, 213);
            doc.text(bullet, margin + 5, y);
            
            // Render content
            doc.setTextColor(0, 0, 0);
            y = renderFormattedText(item.formatted, indent, y, pageWidth - indent - margin, 11) + 3;
          });
          
          if (!isLastBlock) y += 10;
          break;
          
        case 'blockquote':
          checkPageBreak(40);
          
          // Quote bar
          doc.setFillColor(200, 200, 200);
          doc.rect(margin, y - 5, 3, block.content.length * 15 + 10, 'F');
          
          // Quote background
          doc.setFillColor(248, 248, 248);
          doc.rect(margin + 5, y - 5, pageWidth - 2 * margin - 5, block.content.length * 15 + 10, 'F');
          
          doc.setTextColor(80, 80, 80);
          doc.setFont("helvetica", 'italic');
          
          block.content.forEach(contentItem => {
            y = renderFormattedText(contentItem, margin + 15, y, pageWidth - 2 * margin - 20, 11) + 5;
          });
          
          if (!isLastBlock) y += 15;
          break;
          
        case 'codeblock':
          checkPageBreak(Math.max(40, block.content.length * 12 + 20));
          
          // Code background
          doc.setFillColor(245, 245, 245);
          const codeHeight = block.content.length * 12 + 20;
          doc.rect(margin, y - 5, pageWidth - 2 * margin, codeHeight, 'F');
          
          // Code border
          doc.setDrawColor(200, 200, 200);
          doc.rect(margin, y - 5, pageWidth - 2 * margin, codeHeight, 'S');
          
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          doc.setFont('courier', 'normal');
          
          block.content.forEach((line, lineIndex) => {
            doc.text(line, margin + 10, y + 10 + (lineIndex * 12));
          });
          
          y += codeHeight + 10;
          break;
      }
    });
    
    // Add footer with generation date
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.setFont("helvetica", 'normal');
      doc.text(
        `Generated on ${new Date().toLocaleDateString()} - Page ${i} of ${totalPages}`,
        margin,
        pageHeight - 20
      );
      doc.text('Created with MeetMemo', pageWidth - margin - 80, pageHeight - 20);
    }
    
    // Generate smart filename
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const titleSlug = summary.meetingTitle 
      ? summary.meetingTitle.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30)
      : 'Meeting-Summary';
    
    doc.save(`${titleSlug}-${dateStr}.pdf`);
  };

  // Debug function for testing content parity (can be removed after testing)
  const debugContentParity = () => {
    if (!summary?.summary) return;
    
    const validation = validateContentParity(summary.summary);
    console.log('🔍 Content Parity Validation:', validation);
    console.log('📄 Parsed Content Blocks:', parseMarkdownContent(summary.summary));
    
    alert(`Content Analysis:
📊 Total Blocks: ${validation.totalBlocks}
📝 Headings: ${validation.headings}
📄 Paragraphs: ${validation.paragraphs} 
📋 Lists: ${validation.lists}
📦 Code Blocks: ${validation.codeblocks}
💬 Blockquotes: ${validation.blockquotes}
🔤 Word Count: ${validation.wordCount}
🏷️ Sections: ${Object.keys(validation.sections).join(', ')}

Check console for detailed breakdown.`);
  };

  const exportTranscriptToTxt = () => {
    if (transcript.length === 0) return;
    let textContent = "Meeting Transcript\n\n";
    transcript.forEach((entry) => {
      const speaker = speakerNameMap[entry.speaker] ?? entry.speaker;
      textContent += `${speaker}: ${entry.text}\n\n`;
    });

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meeting-transcript.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getSpeakerColor = useCallback((speaker) => {
    const colors = [
      "speaker-afblue",
      "speaker-poisedgold",
      "speaker-navyblue",
      "speaker-armyred",
    ];
    if (!(speaker in speakerColorMap.current)) {
      const newColorIndex =
        Object.keys(speakerColorMap.current).length % colors.length;
      speakerColorMap.current[speaker] = colors[newColorIndex];
    }
    return speakerColorMap.current[speaker];
  }, []);

  useEffect(() => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setIsDarkMode(prefersDark);
    document.documentElement.setAttribute(
      "data-theme",
      prefersDark ? "dark" : "light",
    );
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs`)
      .then((res) => res.json())
      .then((data) => {
        const list = Object.entries(data.csv_list).map(([uuid, info]) => ({
          uuid,
          name: info.file_name,
        }));
        setMeetingList(list);
      })
      .catch((err) => {
        logger.apiError("/jobs", err);
        console.error("Failed to fetch meeting list", err);
      });
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording, isPaused]);

  useEffect(() => {
    fetchMeetingList();
  }, []);

  return (
    <div className="app-container">
      <div className="max-width-container">
        {/* Header */}
        <div className="header-card">
          <h1 className="header-title">
            <img src="/logo.png" alt="MeetMemo Logo" className="header-logo" />{" "}
            MeetMemo
          </h1>
          <label className="theme-toggle" style={{ float: "right" }}>
            <input
              type="checkbox"
              checked={isDarkMode}
              onChange={toggleDarkMode}
            />
            <span className="toggle-slider"></span>
          </label>
          <p className="header-subtitle">
            Record, transcribe, and summarize your meetings with AI-powered
            insights
          </p>
        </div>

        <div className="main-grid">
          {/* Left Column */}
          <div className="left-column">
            {/* Recording Controls */}
            <div className="card">
              <h2 className="section-title">
                <Mic className="section-icon" />
                Audio Input
              </h2>

              <div className="controls-container">
                {/* Model select */}
                <label className="model-select-wrapper">
                  <span className="model-select-label">Model:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="model-select"
                  >
                    {["tiny", "medium", "turbo"].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="button-group">
                  {!isRecording && !recordedAudio && !selectedFile ? (
                    <>
                      <button
                        onClick={startRecording}
                        className="btn btn-discrete"
                        title="Start Recording"
                      >
                        <Mic className="btn-icon" />
                      </button>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-discrete"
                        title="Upload Audio File"
                      >
                        <Upload className="btn-icon" />
                      </button>
                    </>
                  ) : isRecording ? (
                    <>
                      <button
                        onClick={isPaused ? resumeRecording : pauseRecording}
                        className="btn btn-discrete"
                        title={
                          isPaused ? "Resume Recording" : "Pause Recording"
                        }
                      >
                        {isPaused ? (
                          <Play className="btn-icon" />
                        ) : (
                          <Pause className="btn-icon" />
                        )}
                      </button>

                      <button
                        onClick={stopRecording}
                        className="btn btn-discrete"
                        title="Stop Recording"
                      >
                        <Square className="btn-icon" />
                      </button>
                    </>
                  ) : recordedAudio ? (
                    <>
                      <button
                        onClick={discardRecording}
                        className="btn btn-discrete"
                        title="Discard Recording"
                      >
                        <Trash2 className="btn-icon" />
                      </button>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-discrete"
                        title="Upload Audio File"
                      >
                        <Upload className="btn-icon" />
                      </button>
                    </>
                  ) : selectedFile ? (
                    <>
                      <button
                        onClick={discardUpload}
                        className="btn btn-discrete"
                        title="Discard Upload"
                      >
                        <Trash2 className="btn-icon" />
                      </button>

                      <button
                        onClick={startRecording}
                        className="btn btn-discrete"
                        title="Start Recording"
                      >
                        <Mic className="btn-icon" />
                      </button>
                    </>
                  ) : null}

                  <button
                    onClick={recordedAudio ? processRecordedAudio : uploadFile}
                    disabled={(!selectedFile && !recordedAudio) || loading}
                    className={`btn ${(selectedFile || recordedAudio) && !loading ? "btn-discrete-prominent" : "btn-discrete"}`}
                    title={loading ? "Processing..." : "Process Audio"}
                  >
                    <Send className="btn-icon" />
                    {(selectedFile || recordedAudio) && !loading
                      ? "Process Audio"
                      : ""}
                  </button>

                  {isRecording && (
                    <div className="recording-indicator">
                      <div
                        className={`recording-dot ${isPaused ? "paused" : ""}`}
                      ></div>
                      <span className="recording-time">
                        {formatTime(recordingTime)} {isPaused ? "(Paused)" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="file-input"
              />

              {selectedFile && (
                <div className="audio-preview">
                  <h3 className="audio-preview-title">
                    Upload Preview - {selectedFile.name}
                  </h3>
                  <audio
                    ref={uploadPlayerRef}
                    controls
                    className="audio-player"
                  />
                </div>
              )}

              {recordedAudio && (
                <div className="audio-preview">
                  <h3 className="audio-preview-title">Recording Preview</h3>
                  <audio
                    ref={audioPlayerRef}
                    controls
                    className="audio-player"
                  />
                </div>
              )}

              {(loading || isProcessing) && (
                <div className="processing-indicator">
                  <div className="spinner"></div>
                  <span>{loadingText}</span>
                </div>
              )}
            </div>

            {/* Transcript & Summary */}
            <div className="card">
              <div className="transcript-summary-header">
                <div className="tabs">
                  <button
                    className={`tab-button ${!showSummary ? "active" : ""}`}
                    onClick={() => setShowSummary(false)}
                  >
                    <FileText className="section-icon" />
                    Transcript
                  </button>
                  <button
                    className={`tab-button ${showSummary ? "active" : ""}`}
                    onClick={() => setShowSummary(true)}
                  >
                    <Hash className="section-icon" />
                    Summary
                  </button>
                </div>
                <div className="actions-group">
                  {!showSummary && (
                    <button
                      onClick={exportTranscriptToTxt}
                      className="btn btn-success btn-small"
                    >
                      <Download className="btn-icon" />
                      Export TXT
                    </button>
                  )}
                  {showSummary && (
                    <div className="summary-actions-group">
                      <button
                        onClick={() => setShowPromptInputs(!showPromptInputs)}
                        className="btn btn-secondary btn-small"
                      >
                        {showPromptInputs ? "Hide Prompts" : "Custom Prompts"}
                      </button>
                      <button
                        onClick={exportToPDF}
                        className="btn btn-success btn-small"
                      >
                        <Download className="btn-icon" />
                        Export PDF
                      </button>
                      {/* Debug button for testing - remove after verification */}
                      {process.env.NODE_ENV === 'development' && (
                        <button
                          onClick={debugContentParity}
                          className="btn btn-secondary btn-small"
                          title="Debug: Verify content parity between web and PDF"
                        >
                          🔍 Debug
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Prompts Section */}
              {showSummary && showPromptInputs && (
                <div className="custom-prompts-section">
                  <div className="prompt-input-group">
                    <label htmlFor="system-prompt">
                      System Prompt (Optional):
                    </label>
                    <textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="e.g., You are a helpful assistant that summarizes meeting transcripts with focus on technical decisions..."
                      className="prompt-textarea"
                      rows={3}
                    />
                  </div>
                  <div className="prompt-input-group">
                    <label htmlFor="custom-prompt">
                      Custom User Prompt (Optional):
                    </label>
                    <textarea
                      id="custom-prompt"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g., Please summarize this meeting focusing on action items and deadlines..."
                      className="prompt-textarea"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={() =>
                      selectedMeetingId && fetchSummary(selectedMeetingId, true)
                    }
                    className="btn btn-primary btn-small"
                    disabled={!selectedMeetingId}
                  >
                    Regenerate Summary
                  </button>
                </div>
              )}
              {showSummary ? (
                summaryLoading ? (
                  <div className="processing-indicator">
                    <div className="spinner"></div>
                    <span>Generating summary with AI…</span>
                  </div>
                ) : summary && summary.summary ? (
                  <div className="summary-content">
                    {isRenaming ? (
                      <div className="rename-container">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="rename-input"
                        />
                        <div className="rename-buttons-group">
                          <button
                            onClick={handleRename}
                            className="btn btn-success btn-small"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsRenaming(false)}
                            className="btn btn-secondary btn-small"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>
                        <strong>Title:</strong> {summary.meetingTitle}
                        <button
                          onClick={() => {
                            setIsRenaming(true);
                            setNewName(summary.meetingTitle);
                          }}
                          className="btn btn-secondary btn-small rename-btn"
                        >
                          Rename
                        </button>
                      </p>
                    )}
                    <div className="summary-text">
                      <ContentRenderer 
                        contentBlocks={parseMarkdownContent(summary.summary)} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Hash className="empty-icon" />
                    <p className="empty-title">No summary available</p>
                    <p className="empty-subtitle">
                      Summary will appear after processing audio
                    </p>
                  </div>
                )
              ) : (
                <div className="transcript-container">
                  {transcript.length > 0 ? (
                    transcript.map((entry) => (
                      <div key={entry.id} className="transcript-entry">
                        <div className="transcript-header">
                          {editingSpeaker === entry.speaker ? (
                            <div className="speaker-edit-container">
                              <input
                                type="text"
                                defaultValue={entry.speaker ?? "SPEAKER_00"}
                                onBlur={(e) => {
                                  handleSpeakerNameChange(
                                    entry.speaker,
                                    e.target.value,
                                  );
                                  setEditingSpeaker(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSpeakerNameChange(
                                      entry.speaker,
                                      e.target.value,
                                    );
                                    setEditingSpeaker(null);
                                  }
                                }}
                              />
                              <button
                                onClick={() => setEditingSpeaker(null)}
                                className="btn btn-success btn-small"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="speaker-container">
                              <span
                                className={`speaker-badge ${getSpeakerColor(entry.speakerId)}`}
                              >
                                {speakerNameMap[entry.speaker] ?? entry.speaker}
                              </span>
                              <button
                                onClick={() => setEditingSpeaker(entry.speaker)}
                                className="btn btn-secondary btn-small rename-speaker-btn"
                              >
                                Rename
                              </button>
                            </div>
                          )}
                          <span className="timestamp">
                            {entry.start}s - {entry.end}s
                          </span>
                        </div>
                        <p className="transcript-text">{entry.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Mic className="empty-icon" />
                      <p className="empty-title">No transcript available</p>
                      <p className="empty-subtitle">
                        Start recording or upload an audio file to begin
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column – Past Meetings */}
          <div className="right-column">
            <div className="card meetings-card">
              <h2 className="section-title">
                <FileText className="section-icon" />
                Meetings
              </h2>
              <div className="meetings-scroll-wrapper">
                {meetingList.map((meeting, index) => {
                  // Create gradient pattern: 1-2-3-4-3-2-1-2-3-4-3-2...
                  const pattern = [1, 2, 3, 4, 3, 2];
                  const colorClass = `btn-past-${pattern[index % pattern.length]}`;
                  return (
                    <div key={meeting.uuid} className="meeting-entry">
                      <button
                        className={`space btn btn-small ${colorClass} ${
                          selectedMeetingId === meeting.uuid ? "btn-active" : ""
                        }`}
                        onClick={() => loadPastMeeting(meeting.uuid)}
                      >
                        {truncateFileName(meeting.name)}
                      </button>
                      <button
                        className="btn btn-discrete btn-small delete-meeting-btn"
                        onClick={() => handleDeleteMeeting(meeting.uuid)}
                        title="Delete Meeting"
                      >
                        <Trash2 className="btn-icon" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingTranscriptionApp;
