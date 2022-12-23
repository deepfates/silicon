// THis function returns the cosine similarity of two vectors
export const cosineSimilarity = (a: number[], b: number[]) => {
	const dotProduct = dot(a, b);
	const magnitudeA = magnitude(a);
	const magnitudeB = magnitude(b);
	return dotProduct / (magnitudeA * magnitudeB);
};
// This function returns the dot product of two vectors
const dot = (a: number[], b: number[]) => {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i];
	}
	return sum;
};
// This function returns the magnitude of a vector
const magnitude = (a: number[]) => {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * a[i];
	}
	return Math.sqrt(sum);
};