//
//  ContentView.swift
//  Transplant Platform - Patient Mobile App
//
//  Legacy view - replaced by RootView in new architecture
//  Kept for backward compatibility during transition
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        RootView()
            .environmentObject(AuthenticationManager())
            .environmentObject(AppState())
    }
}

#Preview {
    ContentView()
}
