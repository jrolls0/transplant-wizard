//
//  AuthenticationFlow.swift
//  Transplant Platform - Patient Mobile App
//
//  Patient authentication flow with registration and login
//

import SwiftUI

struct AuthenticationFlow: View {
    @State private var selectedTab: AuthTab = .login
    @State private var showingRegistration = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [
                        Color(red: 0.95, green: 0.97, blue: 1.0),
                        Color(red: 0.9, green: 0.94, blue: 0.98)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                VStack(spacing: 0) {
                    // Header
                    AuthHeaderView()
                        .padding(.bottom, 40)
                    
                    // Tab selector
                    AuthTabSelector(selectedTab: $selectedTab)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 30)
                    
                    // Content
                    TabView(selection: $selectedTab) {
                        LoginView()
                            .tag(AuthTab.login)
                        
                        RegistrationView(selectedTab: $selectedTab)
                            .tag(AuthTab.register)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .animation(.easeInOut(duration: 0.3), value: selectedTab)
                    
                    Spacer()
                }
            }
        }
        .navigationBarHidden(true)
    }
    
    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}

// MARK: - Auth Header

struct AuthHeaderView: View {
    var body: some View {
        VStack(spacing: 16) {
            // App logo
            Image(systemName: "heart.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
            
            // Title
            VStack(spacing: 4) {
                Text("Transplant Portal")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                
                Text("Your journey to a new beginning")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.top, 40)
    }
}

// MARK: - Tab Selector

struct AuthTabSelector: View {
    @Binding var selectedTab: AuthTab
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(AuthTab.allCases, id: \.self) { tab in
                Button(action: {
                    // Dismiss keyboard when switching tabs
                    hideKeyboard()
                    
                    withAnimation(.easeInOut(duration: 0.3)) {
                        selectedTab = tab
                    }
                }) {
                    VStack(spacing: 8) {
                        Text(tab.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(selectedTab == tab ? .white : .secondary)
                        
                        Rectangle()
                            .frame(height: 2)
                            .foregroundColor(selectedTab == tab ? .clear : .clear)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 25)
                            .fill(selectedTab == tab ? 
                                  Color(red: 0.2, green: 0.6, blue: 0.9) : 
                                  Color.clear)
                    )
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 25)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 2)
        )
    }
    
    private func hideKeyboard() {
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
    }
}

// MARK: - Supporting Types

public enum AuthTab: CaseIterable {
    case login
    case register
    
    var title: String {
        switch self {
        case .login: return "Sign In"
        case .register: return "Register"
        }
    }
}

#Preview {
    AuthenticationFlow()
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}