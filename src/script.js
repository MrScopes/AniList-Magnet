async function main() {
    try {
		updateTitle(`Loading...`);
        const id = await getAniListID();
		updateTitle(`Getting Media Info...`);

        const media = await getMedia(id);
		updateTitle(`Getting Torrent Info...`);

        const torrents = await getTorrentData(media);

        // Update the title element
        document.getElementById('title').className = 'title';
        updateTitle(media.title.romaji);

        // Map and sort torrent data
        const data = torrents.map(info => ({
            name: info.title,
            magnet: info.magnet_uri,
            size: formatFileSize(info.total_size),
            seeders: info.seeders,
            date: formatDate(new Date(info.timestamp * 1000))
        }));

        // Update the text container with sorted data
        updateTextContainer(data);

    } catch (err) {
        handleError(err);
    }
}

// For progress updates
function updateTitle(title) {
	document.getElementById('title').innerText = title;
}

// Get the AniList ID from the active Chrome tab
async function getAniListID() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            if (tabs.length === 0) {
                return reject(new Error('No active tab found.'));
            }

            const url = tabs[0].url;
            const id = url.split('/')[4];
            resolve(id);
        });
    });
}

// Fetch torrent data from multiple sources and combine them
async function getTorrentData(media) {
    try {
        const responses = await Promise.all([
            fetch(`https://feed.animetosho.org/json?q=${encodeURIComponent(media.title.english)}`),
            fetch(`https://feed.animetosho.org/json?q=${encodeURIComponent(media.title.romaji)}`),
            fetch(`https://feed.animetosho.org/json?q=${encodeURIComponent(removeSeasonInfo(media.title.romaji))}`)
        ]);

        const data = await Promise.all(responses.map(response => response.json()));

        // Combine and sort the data
        const combinedData = [...data[0], ...data[1], ...data[2]];

        // Filter out duplicate entries
        const uniqueTorrents = Array.from(new Set(combinedData.map(torrent => torrent.magnet_uri)))
            .map(magnet_uri => combinedData.find(torrent => torrent.magnet_uri === magnet_uri));
    
        return sortData(uniqueTorrents);

    } catch (error) {
        throw error;
    }
}

// Fetch media details from AniList API
async function getMedia(id) {
    try {
        const response = await fetch(`https://graphql.anilist.co`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                query: 'query ($id: Int) { Media (id: $id, type: ANIME) { title { english romaji } } }',
                variables: { id }
            })
        });

        if (!response.ok) {
            const errorMessage = response.status === 400
                ? JSON.stringify(await response.json())
                : `AniList API Returned Status Code ${response.status}`;
            throw new Error(errorMessage);
        }

        const json = await response.json();
        return json.data.Media;

    } catch (error) {
        throw error;
    }
}

// Retry the main function on error
function retry() {
    document.getElementById('retry').style.display = 'none'; // Hide retry button
    document.getElementById('error').style.display = 'none'; // Hide error message
    document.getElementById('errorMessage').innerText = '';
    main();
}

// Handle and display errors
function handleError(err) {
    console.error(err);
    document.getElementById('retry').style.display = 'inline'; // Show retry button
    document.getElementById('error').style.display = 'flex'; // Show error message
    document.getElementById('errorMessage').innerText = err;
}

// Format file size from bytes to a readable string
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Extract episode number from the title
function extractEpisodeNumber(title) {
    const cleanedTitle = removeSeasonInfo(title);
    const match = cleanedTitle.match(/E(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Remove season info from the title
function removeSeasonInfo(title) {
    if (typeof title !== 'string') {
        return '';
    }

    const seasonRegex = /\b(?:\d+\s*(?:st|nd|rd|th)?\s*season|season\s*\d*\s*(?:st|nd|rd|th)?|season|(?:3rd|2nd|1st)\s*season|(?:season\s*\d+)|\d+[\s\W]*season)\b/gi;
    return title.replace(seasonRegex, '').trim();
}

// Sort torrent data based on priority, episode number, and seeders
function sortData(data) {
    return data.sort((a, b) => {
        const isAImportant = /SubsPlease|1080p/i.test(a.name);
        const isBImportant = /SubsPlease|1080p/i.test(b.name);

        if (isAImportant && !isBImportant) {
            return -1;
        } else if (!isAImportant && isBImportant) {
            return 1;
        }

        const episodeA = extractEpisodeNumber(a.name);
        const episodeB = extractEpisodeNumber(b.name);

        if (episodeA !== episodeB) {
            return episodeB - episodeA;
        }

        return b.seeders - a.seeders;
    });
}

// Update the text container with the sorted data
function updateTextContainer(data) {
    const container = document.getElementById('textContainer');

    container.innerHTML = `
        <div class="text-row">
            <div class="header-item">File Name</div>
            <div class="header-item">File Size</div>
            <div class="header-item">Seeds</div>
			<div class="header-item">Date</div>
        </div>
    `;
    data.forEach(item => {
        container.innerHTML += `
            <div class="text-row">
                <div class="row-item"><a href="${item.magnet}" target="_blank">${item.name}</a></div>
                <div class="row-item">${item.size}</div>
                <div class="row-item">${item.seeders}</div>
				<div class="row-item">${item.date}</div>
            </div>
        `;
    });
}

// M/DD/YY
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }

    const month = date.getMonth() + 1; // Months are zero-indexed (0 = January)
    const day = date.getDate();
    const year = date.getFullYear() % 100; // Get last two digits of the year

    // Pad day with leading zero if necessary
    const paddedDay = day < 10 ? '0' + day : day;

    return `${month}/${paddedDay}/${year < 10 ? '0' + year : year}`;
}

// Setup
main();

// Retry button on error, can't add this in the HTML file due to extension limitations
document.getElementById('retry').addEventListener('click', retry);