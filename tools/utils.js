module.exports = {
    safe,
    sleep,
    clone
}

async function safe(fn, ...args) {
	try {
		return await fn(...args)
	} catch (error) {
		console.error(error)
	}
}

async function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

function clone(object) {
	if (typeof object !== 'object') return object
	if (Array.isArray(object)) return object.map(clone)

	const newObj = {}
	Object.entries(object).forEach(([key, value]) => {
		newObj[key] = clone(value)
	})

	return newObj
}