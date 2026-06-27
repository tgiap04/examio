import Foundation

struct UserProfile: Decodable {
    let id: String
    let email: String
    let username: String?
    let name: String?
    let avatar: String?
    let banner: String?
    let bio: String?
    let isVerified: Bool
}

struct UpdateProfileBody: Encodable {
    let name: String?
    let bio: String?
}

struct UploadImageResponse: Decodable {
    let url: String
}

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var uploadingAvatar = false
    @Published var uploadingBanner = false

    private let api = ExamioAPIClient.shared

    init() { Task { await load() } }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            profile = try await api.get("/profile")
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func updateProfile(name: String?, bio: String?) {
        Task {
            isLoading = true
            do {
                profile = try await api.put("/profile", body: UpdateProfileBody(name: name, bio: bio))
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func uploadAvatar(data: Data, filename: String, mimeType: String) {
        Task {
            uploadingAvatar = true
            do {
                let _: UploadImageResponse = try await api.uploadMultipart("/profile/upload-avatar", fileData: data, filename: filename, mimeType: mimeType)
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
            uploadingAvatar = false
        }
    }

    func uploadBanner(data: Data, filename: String, mimeType: String) {
        Task {
            uploadingBanner = true
            do {
                let _: UploadImageResponse = try await api.uploadMultipart("/profile/upload-banner", fileData: data, filename: filename, mimeType: mimeType)
                await load()
            } catch {
                errorMessage = error.localizedDescription
            }
            uploadingBanner = false
        }
    }
}
