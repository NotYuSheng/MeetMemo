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
import { useCallback } from "react";

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

// Generate a UUID4-like string for client-side use
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const formatSpeakerName = (speakerName) => {
  if (!speakerName) return "Speaker 1";
  
  // Convert SPEAKER_XX format to "Speaker X" format
  const match = speakerName.match(/^SPEAKER_(\d+)$/);
  if (match) {
    const speakerNumber = parseInt(match[1], 10) + 1; // Convert 0-based to 1-based
    return `Speaker ${speakerNumber}`;
  }
  
  // Return the original name if it doesn't match the SPEAKER_XX pattern
  return speakerName;
};

const processTranscriptWithSpeakerIds = (transcriptData) => {
  const speakerMap = {};
  let speakerCounter = 1;
  return transcriptData.map((entry) => {
    const speaker = entry.speaker ?? "SPEAKER_00";
    if (!speakerMap[speaker]) {
      speakerMap[speaker] = speakerCounter++;
    }
    return {
      id: generateUUID(),
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
      {contentBlocks.map((block) => {
        const key = `block-${generateUUID()}`;
        
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
                  <span key={`p-${generateUUID()}`}>
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
                {block.items.map((item) => (
                  <li key={`li-${generateUUID()}`} style={{ marginLeft: `${item.indent || 0}px` }}>
                    {renderInlineFormatting(item.formatted)}
                  </li>
                ))}
              </ListTag>
            );
            
          case 'blockquote':
            return (
              <blockquote key={key} className="content-blockquote">
                {block.content.map((item) => (
                  <p key={`bq-${generateUUID()}`}>
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
        // Regenerate summary with updated speaker names
        if (summary && summary.summary) {
          fetchSummary(selectedMeetingId, true);
        }
      })
      .catch((err) => {
        console.error("Failed to save speaker names:", err);
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
        setSummary({
          meetingTitle: data.fileName,
          summary: data.summary,
        });
      })
      .catch((err) => console.error("Failed to load past meeting", err))
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
      .catch((err) => console.error("Failed to rename meeting", err));
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

  const pollJobStatus = async (uuid, maxAttempts = 30) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}/jobs/${uuid}/status`);
        const statusData = await response.json();

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
          throw new Error(statusData.error_message || "Job failed");
        }

        // Job still processing, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error polling job status:", error);
        throw error;
      }
    }
    throw new Error("Job polling timeout - processing took too long");
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    speakerColorMap.current = {};
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });

      // Check for HTTP 413 error (Request Entity Too Large)
      if (response.status === 413) {
        throw new Error("File too large. Please upload a file smaller than 100MB.");
      }
      
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

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
      console.error("Failed to process uploaded file:", err);
      alert(`Failed to process file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob);

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        body: formData,
      });

      // Check for HTTP 413 error (Request Entity Too Large)
      if (response.status === 413) {
        throw new Error("Recording too large. Please record a shorter audio clip or upload a smaller file.");
      }
      
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

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
          status_code: info.status_code,
        }));
        setMeetingList(list);
      })
      .catch((err) => console.error("Failed to fetch meeting list", err));
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
            setSummary({
              meetingTitle: data.fileName,
              summary: data.summary,
            });
          }
        })
        .catch((err) => console.error("Failed to fetch summary", err))
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
      .catch((err) => console.error("Delete failed:", err));
  };

  const exportToPDF = async () => {
    if (!summary || !selectedMeetingId) return;
    
    console.log('🔧 Using ReportLab PDF export via backend endpoint');
    
    try {
      // Call backend ReportLab PDF generation endpoint
      const response = await fetch(`${API_BASE_URL}/jobs/${selectedMeetingId}/pdf`);
      
      if (!response.ok) {
        throw new Error(`Failed to generate PDF: ${response.status}`);
      }
      
      // Get the PDF blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger download
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename from response headers or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'meetmemo-summary.pdf';
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert(`Failed to export PDF: ${error.message}`);
    }
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
      const speaker = speakerNameMap[entry.speaker] ?? formatSpeakerName(entry.speaker);
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
          status_code: info.status_code,
        }));
        setMeetingList(list);
      })
      .catch((err) => console.error("Failed to fetch meeting list", err));
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
                  <span>Processing audio with AI...</span>
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
                                defaultValue={formatSpeakerName(entry.speaker ?? "SPEAKER_00")}
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
                                {speakerNameMap[entry.speaker] ?? formatSpeakerName(entry.speaker)}
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
                  const isProcessing = meeting.status_code === "202";
                  const hasError = meeting.status_code === "500";
                  
                  return (
                    <div key={meeting.uuid} className="meeting-entry">
                      <button
                        className={`space btn btn-small ${colorClass} ${
                          selectedMeetingId === meeting.uuid ? "btn-active" : ""
                        } ${isProcessing ? "btn-disabled" : ""}`}
                        onClick={() => {
                          if (!isProcessing) {
                            loadPastMeeting(meeting.uuid);
                          }
                        }}
                        disabled={isProcessing}
                        title={isProcessing ? "This file is still processing" : ""}
                      >
                        {truncateFileName(meeting.name)}
                        {isProcessing && <Clock className="btn-icon status-icon" />}
                        {hasError && <AlertCircle className="btn-icon status-icon error-icon" />}
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
