import CommonCrypto
import Foundation

/// AES-256-CBC decryptor for secure-quiz content.
///
/// Mirrors examio-fe/src/lib/crypto.ts exactly:
///  - ciphertext format is "ivBase64.ciphertextBase64" (split on '.')
///  - mode CBC, padding PKCS7
///  - key = UTF-8 bytes of aesKey.padEnd(32,'!').prefix(32)
enum QuizCrypto {
    static let errorText = "[Lỗi giải mã]"

    /// Raw AES key (un-sliced), read from Info.plist `ExamioQuizAESKey`.
    static var aesKey: String {
        Bundle.main.object(forInfoDictionaryKey: "ExamioQuizAESKey") as? String ?? ""
    }

    /// Decrypt a single encrypted field. Returns plaintext or `errorText` on failure.
    static func decrypt(_ ciphertext: String, key: String = aesKey) -> String {
        guard let dotRange = ciphertext.range(of: ".") else { return errorText }
        let ivPart = String(ciphertext[..<dotRange.lowerBound])
        let dataPart = String(ciphertext[dotRange.upperBound...])
        guard !ivPart.isEmpty, !dataPart.isEmpty,
              let iv = Data(base64Encoded: ivPart),
              let data = Data(base64Encoded: dataPart),
              !data.isEmpty
        else { return errorText }

        let keyBytes = Array(normalizedKey(key).utf8)
        guard let plain = aesCBCDecrypt(data: data, key: keyBytes, iv: iv),
              let text = String(data: plain, encoding: .utf8)
        else { return errorText }
        return text
    }

    /// Decrypt a JSON array of option strings.
    static func decryptOptions(_ ciphertext: String, key: String = aesKey) -> [String] {
        let decrypted = decrypt(ciphertext, key: key)
        guard decrypted != errorText,
              let data = decrypted.data(using: .utf8),
              let options = try? JSONDecoder().decode([String].self, from: data)
        else { return [errorText] }
        return options
    }

    // MARK: - Internals

    private static func normalizedKey(_ key: String) -> String {
        let padded = key.count >= 32 ? key : key + String(repeating: "!", count: 32 - key.count)
        return String(padded.prefix(32))
    }

    private static func aesCBCDecrypt(data: Data, key: [UInt8], iv: Data) -> Data? {
        let bufferSize = data.count + kCCBlockSizeAES128
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        var numBytesDecrypted = 0

        let status = data.withUnsafeBytes { dataPtr in
            iv.withUnsafeBytes { ivPtr in
                CCCrypt(
                    CCOperation(kCCDecrypt),
                    CCAlgorithm(kCCAlgorithmAES),
                    CCOptions(kCCOptionPKCS7Padding),
                    key, key.count,
                    ivPtr.baseAddress,
                    dataPtr.baseAddress, data.count,
                    &buffer, bufferSize,
                    &numBytesDecrypted
                )
            }
        }
        guard status == kCCSuccess else { return nil }
        return Data(buffer.prefix(numBytesDecrypted))
    }
}
