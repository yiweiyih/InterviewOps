export function createSseParser(onEvent) {
  let buffer = ''
  let eventName = 'message'
  let dataLines = []

  const dispatch = () => {
    if (dataLines.length > 0) {
      onEvent({ event: eventName, data: dataLines.join('\n') })
    }
    eventName = 'message'
    dataLines = []
  }

  const processLine = (rawLine) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') eventName = value || 'message'
    if (field === 'data') dataLines.push(value)
  }

  return {
    feed(chunk) {
      buffer += chunk
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        processLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
        newlineIndex = buffer.indexOf('\n')
      }
    },
    finish() {
      if (buffer) processLine(buffer)
      buffer = ''
      dispatch()
    }
  }
}
