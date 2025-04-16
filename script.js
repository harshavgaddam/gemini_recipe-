const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const audioButton = document.getElementById('audio-button'); // Get the audio button
const languageSelect = document.getElementById('language-select'); // Get language select element

// --- IMPORTANT: Replace with your actual Google Cloud Function URL --- //
// const GCF_URL = 'YOUR_GOOGLE_CLOUD_FUNCTION_URL'; 
// Update the URL below with the one provided by the user
const GCF_URL = 'https://us-central1-gen-lang-client-0042736910.cloudfunctions.net/gemini_recipe_service'; 
// -------------------------------------------------------------------- //

// --- Language Definitions ---
// Add more languages and their corresponding BCP 47 codes as needed
// Ensure these codes are supported by the Web Speech API in target browsers
const supportedLanguages = {
    'en-US': 'English (US)',
    'es-ES': 'Español (España)',
    'fr-FR': 'Français (France)',
    'de-DE': 'Deutsch (Deutschland)',
    'it-IT': 'Italiano (Italia)',
    'ja-JP': '日本語 (日本)',
    'hi-IN': 'हिन्दी (भारत)' // Example: Hindi (India)
};

let currentLanguage = 'en-US'; // Default language

// Populate language dropdown
function populateLanguageSelect() {
    for (const [code, name] of Object.entries(supportedLanguages)) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        if (code === currentLanguage) {
            option.selected = true;
        }
        languageSelect.appendChild(option);
    }
}

// --- Speech Recognition Setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isRecording = false;

function setupSpeechRecognition() {
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false; 
        recognition.lang = currentLanguage; // Use selected language
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            userInput.value = speechResult;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            let errorMessage = 'Speech recognition error';
            if (event.error === 'no-speech') {
                errorMessage = "Didn't hear anything. Try again.";
            } else if (event.error === 'audio-capture') {
                errorMessage = "No microphone found. Ensure microphone is enabled.";
            } else if (event.error === 'not-allowed') {
                errorMessage = "Microphone access denied. Please allow access.";
            } else if (event.error === 'language-not-supported') {
                 errorMessage = `Speech recognition for ${supportedLanguages[currentLanguage]} is not supported by your browser.`;
                 // Maybe disable button for this language?
            }
            displayMessage(errorMessage, 'bot'); 
            stopRecording();
        };

        recognition.onend = () => {
           stopRecording();
        };

    } else {
        console.warn('Speech Recognition not supported in this browser.');
        if(audioButton) { // Check if button exists
            audioButton.disabled = true;
            audioButton.textContent = '❌';
            audioButton.title = 'Speech recognition not supported';
        }
    }
}

function startRecording() {
    // Ensure recognition is set up for the current language
    if (!recognition || recognition.lang !== currentLanguage) {
        setupSpeechRecognition();
    }
    if (!recognition || isRecording) return;
    try {
        recognition.start();
        isRecording = true;
        audioButton.classList.add('recording');
        audioButton.title = 'Stop Recording';
        userInput.placeholder = 'Listening...';
    } catch (e) {
        console.error("Error starting recognition:", e);
        // Check if the error is due to language
        if (e.name === 'NotSupportedError' || e.message.includes('language')) {
             displayMessage(`Speech recognition for ${supportedLanguages[currentLanguage]} might not be supported.`, 'bot');
        } else {
            displayMessage("Could not start listening. Check permissions?", 'bot');
        }
        stopRecording(); // Reset state
    }
}

function stopRecording() {
    if (!recognition || !isRecording) return;
    try {
        // Attempt to stop, might already be stopped by onend
        recognition.stop(); 
    } catch(e) {
        console.log("Recognition might already be stopped.");
    }
    isRecording = false;
    if(audioButton) { // Check button exists
        audioButton.classList.remove('recording');
        audioButton.title = 'Start Recording';
    }
    userInput.placeholder = 'Type your message...';
}

// --- Display Message Function with Markdown Parsing ---
function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
    
    // --- Stateful Markdown to HTML Conversion --- 
    let finalHtml = '';
    const lines = message.split('\n');
    let currentListType = null; // null, 'ul', 'ol'

    // Helper function to close list if open
    const closeListIfNeeded = () => {
        if (currentListType) {
            finalHtml += `</${currentListType}>\n`;
            currentListType = null;
        }
    };

    // Helper function to open list if needed
    const openListIfNeeded = (type) => {
        if (currentListType !== type) {
            closeListIfNeeded(); // Close existing different type
            finalHtml += `<${type}>\n`;
            currentListType = type;
        }
    };

    // Helper function for inline formatting (Bold/Italic)
    const applyInlineFormatting = (lineContent) => {
        // Bold: **text** or __text__
        lineContent = lineContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        lineContent = lineContent.replace(/__(.*?)__/g, '<strong>$1</strong>');
        // Italic: *text* or _text_
        // lineContent = lineContent.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Optional: Enable if needed
        // lineContent = lineContent.replace(/_(.*?)_/g, '<em>$1</em>'); // Optional: Enable if needed
        return lineContent;
    };

    lines.forEach(line => {
        let processed = false; 

        // 1. Check for Headings (Simple H1 for #)
        if (line.startsWith('# ')) {
            closeListIfNeeded();
            finalHtml += `<h1>${applyInlineFormatting(line.substring(2))}</h1>\n`;
            processed = true;
        } else if (line.startsWith('## ')) { // Optional H2
            closeListIfNeeded();
            finalHtml += `<h2>${applyInlineFormatting(line.substring(3))}</h2>\n`;
            processed = true;
        } else if (line.startsWith('### ')) { // Optional H3
             closeListIfNeeded();
             finalHtml += `<h3>${applyInlineFormatting(line.substring(4))}</h3>\n`;
             processed = true;
        }

        // 2. Check for Unordered List Items (* or -)
        // Need to handle potential bold within the list item like * **For the Crust:**
        if (!processed && line.match(/^\s*[-\*] +(.*)/)) {
            const itemContent = line.replace(/^\s*[-\*] +/, '');
            openListIfNeeded('ul');
            finalHtml += `  <li>${applyInlineFormatting(itemContent)}</li>\n`;
            processed = true;
        }

        // 3. Check for Ordered List Items (1.)
        if (!processed && line.match(/^\s*\d+\. +(.*)/)) {
            const itemContent = line.replace(/^\s*\d+\. +/, '');
            openListIfNeeded('ol');
            finalHtml += `  <li>${applyInlineFormatting(itemContent)}</li>\n`;
            processed = true;
        }

        // 4. Handle Lines with Bold Markers (like **1. Description:**)
        // This is a bit specific, might need adjustment based on exact format
        if (!processed && line.match(/^\s*\*\*.*\*\*:/)) {
            closeListIfNeeded(); // Treat these as paragraph-like separators
            // We apply inline formatting, which handles the bold.
            finalHtml += `<p>${applyInlineFormatting(line)}</p>\n`;
            processed = true;
        }

        // 5. Handle Plain Text Lines (potential paragraphs)
        if (!processed) {
            closeListIfNeeded(); // End any list before a paragraph
            const trimmedLine = line.trim();
            if (trimmedLine) { // Only add paragraphs for non-empty lines
                finalHtml += `<p>${applyInlineFormatting(line)}</p>\n`; 
            } 
            // Empty lines act as separators, no explicit tag needed
        }
    });

    // Close any list that might be open at the very end
    closeListIfNeeded();
    // --- End Stateful Conversion ---

    messageElement.innerHTML = finalHtml; // Set the parsed HTML content
    
    chatMessages.appendChild(messageElement);
    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function fetchRecipe(userQuery) {
    displayMessage('Thinking...', 'bot'); 
    const thinkingMessage = chatMessages.lastElementChild;

    try {
        const response = await fetch(GCF_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Match the expected format from the old working script
            body: JSON.stringify({ 
                dish: userQuery // Use 'dish' key instead of 'query'
                // Do not send 'language' as the old script didn't
            }) 
        });

        if (thinkingMessage && thinkingMessage.textContent.includes('Thinking...')) {
            chatMessages.removeChild(thinkingMessage);
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        const recipe = data.recipe || data.answer || data.text; 

        if (recipe) {
            displayMessage(recipe, 'bot');
        } else {
            displayMessage("Sorry, I couldn't get a recipe for that.", 'bot');
        }

    } catch (error) {
        console.error('Error fetching recipe:', error);
        if (thinkingMessage && thinkingMessage.parentNode === chatMessages && thinkingMessage.textContent.includes('Thinking...')) {
             chatMessages.removeChild(thinkingMessage);
        }
        displayMessage(`Sorry, something went wrong: ${error.message}`, 'bot');
    }
}

function sendMessage() {
    const query = userInput.value.trim();
    if (query) {
        displayMessage(query, 'user');
        fetchRecipe(query);
        userInput.value = ''; 
    }
}

// Language select listener
languageSelect.addEventListener('change', (event) => {
    currentLanguage = event.target.value;
    console.log(`Language changed to: ${currentLanguage}`);
    // Update speech recognition language if it exists
    if (recognition) {
        // If recording, stop it before changing language
        if (isRecording) { 
            stopRecording();
        }
        recognition.lang = currentLanguage;
        console.log(`Speech recognition language set to: ${recognition.lang}`);
        // Re-run setup if needed or just update lang
        // setupSpeechRecognition(); // Or just update lang if instance persists well
    }
    // You might want to clear the chat or add a message indicating language change
    // displayMessage(`Language set to ${supportedLanguages[currentLanguage]}`, 'bot');
});

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

if (audioButton) { // Check button exists before adding listener
    audioButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
}

// Initial setup
populateLanguageSelect();
setupSpeechRecognition(); // Setup recognition with default language 
