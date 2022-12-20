import axios from 'axios';

// This is the function for sending a request to the OpenAI API endpoint
// It takes a model name and array of strings
// And retuns an object like this:
// {
//   "object": "list",
//   "data": [
//     {
//       "object": "embedding",
//       "embedding": [
//         0.0023064255,
//         -0.009327292,
//         .... (1536 floats total for ada)
//         -0.0028842222,
//       ],
//       "index": 0
//     }
// 		... (one object for each string in the input)
//   ],
//   "model": "text-embedding-ada-002",
//   "usage": {
//     "prompt_tokens": 8,
//     "total_tokens": 8
//   }
// }

export async function getEmbeddings(strings: string[], apiKey: string) {
    const model = 'text-embedding-ada-002'
    const data = {
        "input": strings,
        "model": model
    }
    const response = await axios.post('https://api.openai.com/v1/embeddings', data, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        }
    });
    return response.data;
}


	// This is the function to embed file texts using OpenAI's API
	// Each text must be truncated to 8192 tokens, or roughly 2000 characters
	// We use the OpenAI API to embed the text, and then add it to the annoy index
	// OpenAI can take an array of texts to embed, so we can embed multiple texts at once
	// This is much faster than embedding them one at a time
	// If the text is too long, we split it into chunks and embed them separately
	// We then average the embeddings to get a single embedding for the whole text
	// If the text is already embedded, we skip it
	// If the text is empty, we skip it
	// If the text is already in the database, but the text has changed, we re-embed it

	export async function embedText(text: string, apiKey: string) {

		let chunks = [text];
		// If the text is too long, split it into chunks
		if (text.length > 2000) {
			// Split the text into chunks of 2000 characters
			chunks = text.match(/.{1,2000}/g);
		}
		
		// Embed the chunks
		const resp = await getEmbeddings(chunks, apiKey);
		// If there's just one chunk, we can just use the embedding
		if (chunks.length == 1) {
			const embedding = resp.data[0].embedding
			return embedding;
		}

		// Average the embeddings
		// Have to get the 'embedding' array from the object in "data"
		// Then average the values in the array
		let embeddings = resp.data.map((item) => item.embedding);

		let avgEmbedding = embeddings.reduce((prev, curr) => {
			return prev.map((item, index) => item + curr[index]);
		}
		).map((item) => item / embeddings.length);

		return avgEmbedding
		
	}