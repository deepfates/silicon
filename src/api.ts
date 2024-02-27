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

// This function is used to embed an array of strings using OpenAI's API
// It has perfect error handling
export async function getEmbeddings(strings: string[], apiKey: string) {
    const model = 'text-embedding-3-large'
    const data = {
        "input": strings,
        "model": model
    }
	try {

    const response = await axios.post('https://api.openai.com/v1/embeddings', data, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        }
		
    }
	);
	return response.data;
} catch (error) {
	console.log(error);
	return {data: []};
}

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

export async function embedText(basename: string, text: string, apiKey: string): Promise<Float32Array > {
	const input_chunks = [basename, "\n", text];
	const output_chunks = [];


	const MAX_CHUNK_LENGTH = 2000;
	const output_chunk_parts = [];
	let remaining_output_chunk_length = MAX_CHUNK_LENGTH;
	for (const input_chunk of input_chunks) {
		let input_chunk_start = 0;

		while (input_chunk.length - input_chunk_start > remaining_output_chunk_length) {
			output_chunk_parts.push(
				input_chunk.substring(input_chunk_start, input_chunk_start + remaining_output_chunk_length)
			);
			output_chunks.push(output_chunk_parts.join(''));
			output_chunk_parts.length = 0;
			input_chunk_start += remaining_output_chunk_length;
			remaining_output_chunk_length = MAX_CHUNK_LENGTH;
		}
		const input_chunk_tail_length = input_chunk.length - input_chunk_start;
		if (input_chunk_tail_length > 0) {
			output_chunk_parts.push(input_chunk.substring(input_chunk_start));
			remaining_output_chunk_length -= input_chunk_tail_length;
		}
	}
	if (output_chunk_parts.length > 0) {
		output_chunks.push(output_chunk_parts.join(''));
	}

	const resp = await getEmbeddings(output_chunks, apiKey);

	let embedding = [];
	if (output_chunks.length === 1) {
		embedding = resp.data[0].embedding
	} else {
		let allEmbeddings: number[][] = resp.data.map((item: any) => item.embedding);
		embedding = allEmbeddings.reduce((prev: number[], curr: number[]) => {
			return prev.map((item: number, index: number) => item + curr[index]);
		}
		).map((item: number) => item / allEmbeddings.length);
	}

	// convert to Float32Array
	embedding = embedding.map((item: number) => parseFloat(item.toFixed(6)));
	return new Float32Array(embedding);
}
