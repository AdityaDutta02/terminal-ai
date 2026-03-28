import net from 'net'
const CLAMAV_HOST = process.env.CLAMAV_HOST ?? 'clamav'
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT ?? '3310')
interface ScanResult {
  clean: boolean
  virusName?: string
}
export async function scanBuffer(data: Buffer, _filename: string): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT })
    const chunks: Buffer[] = []
    socket.on('error', reject)
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString().trim()
      if (response === 'stream: OK') {
        resolve({ clean: true })
        return
      }
      const match = response.match(/stream: (.+) FOUND/)
      resolve({ clean: false, virusName: match?.[1] ?? 'Unknown' })
    })
    const sizeBuf = Buffer.allocUnsafe(4)
    sizeBuf.writeUInt32BE(data.length, 0)
    const terminator = Buffer.alloc(4, 0)
    socket.write('zINSTREAM\0')
    socket.write(sizeBuf)
    socket.write(data)
    socket.write(terminator)
    socket.end()
  })
}
