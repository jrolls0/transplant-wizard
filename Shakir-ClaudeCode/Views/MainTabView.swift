//
//  MainTabView.swift
//  Transplant Platform - Patient Mobile App
//
//  Main tab navigation for authenticated patients
//

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @EnvironmentObject private var appState: AppState
    
    var body: some View {
        TabView(selection: $appState.selectedTab) {
            // Dashboard Tab
            PatientDashboardView()
                .tabItem {
                    Image(systemName: TabSelection.dashboard.icon)
                    Text(TabSelection.dashboard.title)
                }
                .tag(TabSelection.dashboard)
            
            // Documents Tab
            DocumentSubmissionView()
                .tabItem {
                    Image(systemName: TabSelection.documents.icon)
                    Text(TabSelection.documents.title)
                }
                .tag(TabSelection.documents)
            
            // Profile Tab
            PatientProfileView()
                .tabItem {
                    Image(systemName: TabSelection.profile.icon)
                    Text(TabSelection.profile.title)
                }
                .tag(TabSelection.profile)
            
            // Transplant Centers Tab
            TransplantCentersView()
                .tabItem {
                    Image(systemName: TabSelection.centers.icon)
                    Text(TabSelection.centers.title)
                }
                .tag(TabSelection.centers)
            
            // Help & Support Tab
            HelpSupportView()
                .tabItem {
                    Image(systemName: TabSelection.help.icon)
                    Text(TabSelection.help.title)
                }
                .tag(TabSelection.help)
        }
        .accentColor(Color(red: 0.2, green: 0.6, blue: 0.9))
        .onAppear {
            // Reset session timer on tab interactions
            appState.resetSessionTimer()
        }
        .onChange(of: appState.selectedTab) { _, _ in
            appState.resetSessionTimer()
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}