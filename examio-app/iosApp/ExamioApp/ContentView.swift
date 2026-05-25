import SwiftUI

struct ContentView: View {
    @StateObject private var authViewModel = AuthViewModel()
    @State private var selectedTab: AppTab = .home

    var body: some View {
        if authViewModel.isAuthenticated {
            TabView(selection: $selectedTab) {
                HomeView()
                    .tabItem { Label("Trang chủ", systemImage: "house") }
                    .tag(AppTab.home)

                StudyView()
                    .tabItem { Label("Học tập", systemImage: "book") }
                    .tag(AppTab.study)

                MyExamsView()
                    .tabItem { Label("Thi của tôi", systemImage: "doc.text") }
                    .tag(AppTab.exams)

                AiView()
                    .tabItem { Label("AI", systemImage: "sparkles") }
                    .tag(AppTab.ai)

                AccountView()
                    .tabItem { Label("Tài khoản", systemImage: "person.crop.circle") }
                    .tag(AppTab.account)
            }
            .tint(.examioPrimary)
            .onOpenURL { url in
                if let deepLink = parseAppDeepLink(url) {
                    selectedTab = deepLink.targetTab
                }
            }
        } else {
            AuthFlowView(viewModel: authViewModel)
        }
    }
}
