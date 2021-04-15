export default async function (time: number) {
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve()
		}, time)
	})
}