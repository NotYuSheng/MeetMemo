from pyannote.core import Segment
import re


def get_text_with_timestamp(transcribe_res):
    timestamp_texts = []
    for item in transcribe_res['segments']:
        start = item['start']
        end = item['end']
        text = item['text']
        timestamp_texts.append((Segment(start, end), text))
    return timestamp_texts


def add_speaker_info_to_text(timestamp_texts, ann):
    spk_text = []
    for seg, text in timestamp_texts:
        spk = ann.crop(seg).argmax()
        spk_text.append((seg, spk, text))
    return spk_text


def clean_text(text):
    """Clean up text by removing excessive ellipsis and normalizing spaces"""
    if not text:
        return text
    
    # Remove leading/trailing ellipsis and spaces
    text = text.strip(' .')
    
    # Replace multiple ellipsis with single spaces
    text = re.sub(r'\.{2,}', ' ', text)
    
    # Replace multiple spaces with single space
    text = re.sub(r'\s+', ' ', text)
    
    # Clean up remaining artifacts
    text = text.strip()
    
    return text


def merge_cache(text_cache):
    sentence = ''.join([item[-1] for item in text_cache])
    # Clean the merged text
    sentence = clean_text(sentence)
    spk = text_cache[0][1]
    start = text_cache[0][0].start
    end = text_cache[-1][0].end
    return Segment(start, end), spk, sentence


PUNC_SENT_END = ['.', '?', '!']


def merge_sentence(spk_text):
    merged_spk_text = []
    pre_spk = None
    text_cache = []
    
    for seg, spk, text in spk_text:
        # Calculate gap between segments if we have cached text
        gap_duration = 0
        if len(text_cache) > 0:
            gap_duration = seg.start - text_cache[-1][0].end
        
        # Rule 1: Speaker change - force flush
        if spk != pre_spk and pre_spk is not None and len(text_cache) > 0:
            merged_spk_text.append(merge_cache(text_cache))
            text_cache = [(seg, spk, text)]
            pre_spk = spk
        
        # Rule 2: Sentence-ending punctuation - flush only if we have substantial content AND significant gap
        elif text and len(text) > 0 and text[-1] in PUNC_SENT_END:
            text_cache.append((seg, spk, text))
            # Only flush on punctuation if we have substantial content AND a significant gap
            cache_duration = text_cache[-1][0].end - text_cache[0][0].start if len(text_cache) > 0 else 0
            if cache_duration > 8.0 and gap_duration > 3.0:
                merged_spk_text.append(merge_cache(text_cache))
                text_cache = []
            pre_spk = spk
        
        # Rule 3: Long gap between segments - force flush even without punctuation
        elif gap_duration > 5.0 and len(text_cache) > 0:
            merged_spk_text.append(merge_cache(text_cache))
            text_cache = [(seg, spk, text)]
            pre_spk = spk
        
        # Rule 4: Cache getting too long (prevent extremely long segments)
        elif len(text_cache) > 0:
            cache_duration = seg.end - text_cache[0][0].start
            if cache_duration > 25.0:  # Max 25 seconds per segment
                merged_spk_text.append(merge_cache(text_cache))
                text_cache = [(seg, spk, text)]
            else:
                text_cache.append((seg, spk, text))
            pre_spk = spk
        
        # Default: Add to cache
        else:
            text_cache.append((seg, spk, text))
            pre_spk = spk
    
    # Flush remaining cache
    if len(text_cache) > 0:
        merged_spk_text.append(merge_cache(text_cache))
    
    return merged_spk_text


def post_process_short_segments(merged_segments, min_duration=8.0, max_gap=4.0):
    """
    Post-process transcript to merge very short consecutive segments from same speaker.
    
    Args:
        merged_segments: List of (segment, speaker, text) tuples
        min_duration: Minimum duration in seconds before considering a segment complete
        max_gap: Maximum gap in seconds to allow merging across
    
    Returns:
        List of (segment, speaker, text) tuples with short segments merged
    """
    if not merged_segments:
        return merged_segments
    
    result = []
    current_cache = [merged_segments[0]]
    
    for i in range(1, len(merged_segments)):
        current_seg, current_spk, current_text = merged_segments[i]
        prev_seg, prev_spk, prev_text = current_cache[-1]
        
        # Calculate duration and gap
        cache_duration = current_cache[-1][0].end - current_cache[0][0].start
        gap = current_seg.start - prev_seg.end
        
        # Merge if same speaker, short duration, and small gap
        if (current_spk == prev_spk and 
            cache_duration < min_duration and 
            gap <= max_gap):
            current_cache.append(merged_segments[i])
        else:
            # Flush current cache and start new one
            if len(current_cache) > 1:
                result.append(merge_cache(current_cache))
            else:
                result.append(current_cache[0])
            current_cache = [merged_segments[i]]
    
    # Flush remaining cache
    if len(current_cache) > 1:
        result.append(merge_cache(current_cache))
    else:
        result.append(current_cache[0])
    
    return result


def recursive_merge_segments(segments, max_iterations=3):
    """
    Recursively apply post-processing until no more merging is possible.
    
    Args:
        segments: List of (segment, speaker, text) tuples
        max_iterations: Maximum number of recursive passes to prevent infinite loops
        
    Returns:
        List of (segment, speaker, text) tuples with maximum merging applied
    """
    current_segments = segments
    
    for iteration in range(max_iterations):
        # Apply post-processing
        new_segments = post_process_short_segments(current_segments)
        
        # If no change occurred, we're done
        if len(new_segments) == len(current_segments):
            # Check if the segments are actually the same (not just same count)
            no_change = True
            for i, ((seg1, spk1, text1), (seg2, spk2, text2)) in enumerate(zip(current_segments, new_segments)):
                if seg1.start != seg2.start or seg1.end != seg2.end or spk1 != spk2 or text1 != text2:
                    no_change = False
                    break
            
            if no_change:
                break
        
        current_segments = new_segments
    
    return current_segments


def diarize_text(transcribe_res, diarization_result, improve_readability=True):
    """
    Transcribe and diarize text with optional readability improvements.
    
    Args:
        transcribe_res: Whisper transcription result
        diarization_result: Pyannote diarization result  
        improve_readability: Apply post-processing to merge short segments
    
    Returns:
        List of (segment, speaker, text) tuples
    """
    timestamp_texts = get_text_with_timestamp(transcribe_res)
    spk_text = add_speaker_info_to_text(timestamp_texts, diarization_result)
    res_processed = merge_sentence(spk_text)
    
    # Apply recursive post-processing to improve readability of short segments
    if improve_readability:
        res_processed = recursive_merge_segments(res_processed)
    
    return res_processed


def write_to_txt(spk_sent, file):
    with open(file, 'w') as fp:
        for seg, spk, sentence in spk_sent:
            line = f'{seg.start:.2f} {seg.end:.2f} {spk} {sentence}\n'
            fp.write(line)
