import '../styles.css';
import { useState, useEffect } from 'react';

export default function TextInterface(){
    const [messages, setMessages] = useState([]);

    // Check backend for updates every 2s
    useEffect(() => {
        const interval = setInterval(() => {
            fetch('http://localhost:8000/api/live-transcript')
                .then((result) => result.json())
                .then((data => {
                    setMessages(data); // data should be an array of {speaker, text}
                })
                .catch((error) => console.error("Error fetching messages:", error)));
        }, 2000);

        return () => clearInterval(interval); // Clean up upon unmounting
    }, []);

    return (
        <div className='text-interface'>
            {messages.map((msg, index) =>(
                <div key={index} className='message-bubble'>
                    <strong>{msg.speaker}</strong>: {msg.text}
                </div>
            ))}
        </div>
    );
}