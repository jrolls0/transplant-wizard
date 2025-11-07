//
//  HelpSupportView.swift
//  Transplant Platform - Patient Mobile App
//
//  Help and support view
//

import SwiftUI

struct HelpSupportView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    Text("Help & Support")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding()
                    
                    Text("Help and support content will be implemented here")
                        .foregroundColor(.secondary)
                        .padding()
                    
                    Spacer()
                }
            }
            .navigationTitle("Help")
        }
    }
}

#Preview {
    HelpSupportView()
}