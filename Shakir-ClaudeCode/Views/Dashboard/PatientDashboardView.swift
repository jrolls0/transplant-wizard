//
//  PatientDashboardView.swift
//  Transplant Platform - Patient Mobile App
//
//  Main dashboard for authenticated patients
//

import SwiftUI

struct PatientDashboardView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @State private var todoRefreshTrigger = UUID()
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Welcome header
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Welcome back,")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        
                        Text(authManager.currentUser?.firstName ?? "Patient")
                            .font(.title)
                            .fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    
                    // Amelia Chatbot - Takes up large portion of screen
                    AmeliaChatbotView(onTodosCreated: {
                        // Trigger todo list refresh
                        todoRefreshTrigger = UUID()
                    })
                        .frame(minHeight: 400)
                        .padding(.horizontal)
                    
                    // Compact Progress indicators
                    VStack(spacing: 12) {
                        HStack(spacing: 16) {
                            CompactProgressIndicator(
                                title: "Profile",
                                progress: 0.8,
                                color: .orange
                            )
                            
                            CompactProgressIndicator(
                                title: "ROI Signed",
                                progress: authManager.currentUser?.roiSigned == true ? 1.0 : 0.0,
                                color: .green
                            )
                            
                            CompactProgressIndicator(
                                title: "Centers",
                                progress: authManager.currentUser?.transplantCentersSelected == true ? 1.0 : 0.0,
                                color: .blue
                            )
                        }
                        .padding(.horizontal)
                    }
                    
                    // Todo List Section
                    if authManager.currentUser?.transplantCentersSelected == true {
                        TodoListSection(refreshTrigger: todoRefreshTrigger)
                            .padding(.horizontal)
                    }
                    
                    Spacer(minLength: 20)
                }
            }
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") {
                        Task {
                            await authManager.signOut()
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Compact Progress Indicator

struct CompactProgressIndicator: View {
    let title: String
    let progress: Double
    let color: Color
    
    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.3), lineWidth: 3)
                
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 1.0), value: progress)
                
                Text("\(Int(progress * 100))%")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(color)
            }
            .frame(width: 50, height: 50)
            
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Amelia Chatbot View

struct AmeliaChatbotView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @EnvironmentObject private var appState: AppState
    @State private var selectedCenters: Set<String> = []
    @State private var isLoading = false
    @State private var hasSubmitted = false
    @State private var transplantCenters: [TransplantCenterOption] = []
    @State private var isLoadingCenters = true
    @State private var showDocumentPrompt = false
    @State private var documentPromptAnswered = false
    @State private var navigateToDocuments = false
    @State private var todosCreated = false
    var onTodosCreated: (() -> Void)?
    
    var body: some View {
        VStack(spacing: 0) {
            // Chatbot Header
            HStack(spacing: 12) {
                // Amelia Avatar
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [Color(red: 0.9, green: 0.3, blue: 0.6), Color(red: 0.7, green: 0.2, blue: 0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                        .frame(width: 50, height: 50)
                    
                    Text("A")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Amelia")
                        .font(.headline)
                        .fontWeight(.semibold)
                    
                    Text("Virtual Transplant Coordinator")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                // Online indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(.green)
                        .frame(width: 8, height: 8)
                    
                    Text("Online")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            
            // Chat Content
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Check if user has already completed transplant center selection
                    if authManager.currentUser?.transplantCentersSelected == true {
                        // Show completed flow with document submission prompt
                        ChatMessage(
                            text: "I'm Amelia, your virtual transplant coordinator. Welcome back!",
                            isFromAmelia: true
                        )
                        
                        ChatMessage(
                            text: "Great news! I've successfully received your transplant center selections and have notified your chosen centers. To continue with the referral process, you'll need to submit the following important documents:",
                            isFromAmelia: true
                        )
                        
                        // Document requirements list
                        VStack(alignment: .leading, spacing: 8) {
                            DocumentRequirementRow(icon: "creditcard.fill", text: "Insurance card (front and back)")
                            DocumentRequirementRow(icon: "pills.fill", text: "Medication card OR medication list")
                            DocumentRequirementRow(icon: "person.text.rectangle.fill", text: "Government-issued ID")
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                        
                        if !documentPromptAnswered {
                            ChatMessage(
                                text: "Would you like to upload these documents now?",
                                isFromAmelia: true
                            )
                            
                            // Yes/No buttons
                            HStack(spacing: 16) {
                                Button(action: {
                                    documentPromptAnswered = true
                                    navigateToDocuments = true
                                    // Navigate to Documents tab
                                    appState.selectedTab = .documents
                                }) {
                                    Text("Yes, let's do it")
                                        .fontWeight(.semibold)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                        .background(
                                            LinearGradient(
                                                colors: [Color(red: 0.2, green: 0.6, blue: 0.9), Color(red: 0.1, green: 0.5, blue: 0.8)],
                                                startPoint: .leading,
                                                endPoint: .trailing
                                            )
                                        )
                                        .foregroundColor(.white)
                                        .cornerRadius(10)
                                }
                                
                                Button(action: {
                                    documentPromptAnswered = true
                                    todosCreated = true
                                    // Add to todo list via API
                                    Task {
                                        await addDocumentTodos()
                                        // Trigger refresh of todo list
                                        onTodosCreated?()
                                    }
                                }) {
                                    Text("Later")
                                        .fontWeight(.semibold)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                        .background(Color(.systemGray5))
                                        .foregroundColor(.primary)
                                        .cornerRadius(10)
                                }
                            }
                            .padding(.top, 8)
                        } else if navigateToDocuments {
                            ChatMessage(
                                text: "Perfect! Tap the Documents tab below to get started uploading your documents.",
                                isFromAmelia: true
                            )
                        } else if todosCreated {
                            ChatMessage(
                                text: "No problem! I've added these documents to your to-do list below. You can also upload them anytime from the Documents tab. I'll continue monitoring your referral progress in the meantime.",
                                isFromAmelia: true
                            )
                        }
                        
                    } else {
                        // Show initial flow for new users
                        ChatMessage(
                            text: "I'm Amelia, your virtual transplant coordinator. To begin your transplant referral process, please review the list of nearby transplant centers below and choose up to three by selecting their corresponding boxes.",
                            isFromAmelia: true
                        )
                        
                        if !hasSubmitted {
                            // Transplant Centers Selection
                            if isLoadingCenters {
                                VStack(spacing: 12) {
                                    ForEach(0..<3, id: \.self) { _ in
                                        HStack {
                                            Rectangle()
                                                .fill(Color.gray.opacity(0.3))
                                                .frame(width: 20, height: 20)
                                                .cornerRadius(4)
                                            
                                            VStack(alignment: .leading, spacing: 4) {
                                                Rectangle()
                                                    .fill(Color.gray.opacity(0.3))
                                                    .frame(height: 20)
                                                    .cornerRadius(4)
                                                
                                                Rectangle()
                                                    .fill(Color.gray.opacity(0.2))
                                                    .frame(height: 16)
                                                    .cornerRadius(4)
                                            }
                                        }
                                        .padding()
                                        .background(Color(.systemGray6))
                                        .cornerRadius(12)
                                        .redacted(reason: .placeholder)
                                    }
                                }
                            } else {
                                VStack(spacing: 12) {
                                    ForEach(transplantCenters, id: \.id) { center in
                                        TransplantCenterRow(
                                            center: center,
                                            isSelected: selectedCenters.contains(center.id)
                                        ) {
                                            toggleSelection(center.id)
                                        }
                                    }
                                }
                            }
                            
                            // Submit Button
                            HStack {
                                Spacer()
                                
                                Button(action: submitSelection) {
                                    HStack {
                                        if isLoading {
                                            ProgressView()
                                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                                .scaleEffect(0.8)
                                        } else {
                                            Text("Submit Selection")
                                                .fontWeight(.semibold)
                                        }
                                    }
                                    .frame(width: 160, height: 44)
                                    .background(
                                        LinearGradient(
                                            colors: selectedCenters.isEmpty ? 
                                                [Color.gray, Color.gray] :
                                                [Color(red: 0.2, green: 0.6, blue: 0.9), Color(red: 0.1, green: 0.5, blue: 0.8)],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .foregroundColor(.white)
                                    .cornerRadius(22)
                                    .disabled(selectedCenters.isEmpty || isLoading)
                                }
                                
                                Spacer()
                            }
                            .padding(.top, 8)
                            
                        } else {
                            // Confirmation Message
                            ChatMessage(
                                text: "Perfect! I've received your selections. I'll now begin coordinating with your chosen transplant centers. You'll receive updates on your referral progress in the coming days.",
                                isFromAmelia: true
                            )
                        }
                    }
                }
                .padding()
            }
        }
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
        .onAppear {
            print("🔄 PatientDashboardView onAppear - Loading transplant centers...")
            print("🔄 User transplantCentersSelected: \(authManager.currentUser?.transplantCentersSelected ?? false)")
            print("🔄 Current isLoadingCenters: \(isLoadingCenters)")
            loadTransplantCenters()
        }
        .refreshable {
            print("🔄 Refreshing transplant centers...")
            loadTransplantCenters()
        }
    }
    
    private func toggleSelection(_ centerId: String) {
        if selectedCenters.contains(centerId) {
            selectedCenters.remove(centerId)
        } else if selectedCenters.count < 3 {
            selectedCenters.insert(centerId)
        }
    }
    
    private func loadTransplantCenters() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { 
            print("❌ No access token found")
            return 
        }
        
        print("🔄 Starting to load transplant centers with token...")
        isLoadingCenters = true
        
        Task {
            do {
                print("🔄 Calling API to get transplant centers...")
                let centers = try await APIService.shared.getTransplantCenters(accessToken: accessToken)
                print("✅ Received \(centers.count) transplant centers from API")
                
                await MainActor.run {
                    // Convert API response to TransplantCenterOption format
                    self.transplantCenters = centers.prefix(5).map { center in
                        TransplantCenterOption(
                            id: center.id,
                            name: center.name,
                            location: "\(center.city ?? ""), \(center.state ?? "")",
                            distance: (center.distanceMiles ?? "0") + " miles",
                            waitTime: "\(center.averageWaitTimeMonths ?? 0) months"
                        )
                    }
                    self.isLoadingCenters = false
                    print("✅ Successfully loaded \(self.transplantCenters.count) transplant centers")
                }
            } catch {
                await MainActor.run {
                    self.isLoadingCenters = false
                    print("❌ Failed to load transplant centers: \(error)")
                    if let apiError = error as? APIError {
                        print("❌ API Error details: \(apiError)")
                    }
                }
            }
        }
    }
    
    private func addDocumentTodos() async {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        // Create document upload todos via API
        let todos = [
            ("Upload Insurance Card", "Upload front and back of your insurance card", "insurance_card"),
            ("Upload Medication List", "Upload your medication card or list of current medications", "medication_list"),
            ("Upload Government ID", "Upload a government-issued photo ID", "government_id")
        ]
        
        for (title, description, docType) in todos {
            do {
                try await APIService.shared.createTodo(
                    title: title,
                    description: description,
                    todoType: "document_upload",
                    priority: "high",
                    metadata: ["documentType": docType],
                    accessToken: accessToken
                )
            } catch {
                print("❌ Failed to create todo: \(error)")
            }
        }
        print("✅ Document todos created")
    }
    
    private func submitSelection() {
        guard !selectedCenters.isEmpty else { return }
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        isLoading = true
        
        Task {
            do {
                // Call the real API to save transplant center selections
                let response = try await APIService.shared.selectTransplantCenters(
                    centerIds: Array(selectedCenters),
                    accessToken: accessToken
                )
                
                await MainActor.run {
                    isLoading = false
                    hasSubmitted = true
                    
                    // Update user's completion status
                    if var user = authManager.currentUser {
                        authManager.currentUser = PatientUser(
                            id: user.id,
                            email: user.email,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            profileCompleted: user.profileCompleted,
                            onboardingCompleted: true,
                            roiSigned: user.roiSigned,
                            transplantCentersSelected: true,
                            dialysisClinicId: user.dialysisClinicId,
                            assignedSocialWorkerName: user.assignedSocialWorkerName,
                            createdAt: user.createdAt
                        )
                    }
                    
                    print("✅ Successfully submitted \(selectedCenters.count) transplant center selections")
                }
                
            } catch {
                await MainActor.run {
                    isLoading = false
                    print("❌ Failed to submit transplant centers: \(error)")
                }
            }
        }
    }
}

// MARK: - Supporting Views

struct ChatMessage: View {
    let text: String
    let isFromAmelia: Bool
    
    var body: some View {
        HStack {
            if !isFromAmelia { Spacer() }
            
            Text(text)
                .font(.body)
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(isFromAmelia ? Color(.systemGray5) : Color(red: 0.2, green: 0.6, blue: 0.9))
                )
                .foregroundColor(isFromAmelia ? .primary : .white)
                .multilineTextAlignment(isFromAmelia ? .leading : .trailing)
            
            if isFromAmelia { Spacer() }
        }
    }
}

struct TransplantCenterRow: View {
    let center: TransplantCenterOption
    let isSelected: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Selection checkbox
                Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundColor(isSelected ? Color(red: 0.2, green: 0.6, blue: 0.9) : .secondary)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(center.name)
                        .font(.headline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.leading)
                    
                    HStack(spacing: 16) {
                        HStack(spacing: 4) {
                            Image(systemName: "location")
                            Text(center.distance)
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                        
                        HStack(spacing: 4) {
                            Image(systemName: "clock")
                            Text(center.waitTime)
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                }
                
                Spacer()
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color(red: 0.2, green: 0.6, blue: 0.9).opacity(0.1) : Color(.systemGray6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? Color(red: 0.2, green: 0.6, blue: 0.9) : Color.clear, lineWidth: 2)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Data Models

struct TransplantCenterOption {
    let id: String
    let name: String
    let location: String
    let distance: String
    let waitTime: String
}

// MARK: - Document Requirement Row

struct DocumentRequirementRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                .frame(width: 24)
            
            Text(text)
                .font(.subheadline)
                .foregroundColor(.primary)
            
            Spacer()
        }
    }
}

// MARK: - Todo List Section

struct TodoListSection: View {
    @EnvironmentObject private var appState: AppState
    @State private var todos: [PatientTodo] = []
    @State private var isLoading = true
    
    var refreshTrigger: UUID = UUID()
    
    var pendingTodos: [PatientTodo] {
        todos.filter { $0.status == "pending" }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "checklist")
                    .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                Text("To-Do List")
                    .font(.headline)
                    .fontWeight(.semibold)
                
                Spacer()
                
                if !pendingTodos.isEmpty {
                    Text("\(pendingTodos.count) pending")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                }
            }
            
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
            } else if pendingTodos.isEmpty {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("All tasks completed!")
                        .foregroundColor(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color(.systemGray6))
                .cornerRadius(12)
            } else {
                VStack(spacing: 8) {
                    ForEach(pendingTodos) { todo in
                        TodoItemRow(todo: todo, onTap: {
                            // Navigate to Documents tab for document upload todos
                            if todo.todoType == "document_upload" {
                                appState.selectedTab = .documents
                            }
                        }, onComplete: {
                            Task {
                                await markTodoComplete(todo)
                            }
                        })
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.05), radius: 8, x: 0, y: 4)
        .onAppear {
            loadTodos()
        }
        .onChange(of: refreshTrigger) { _, _ in
            // Reload todos when trigger changes
            loadTodos()
        }
    }
    
    private func loadTodos() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        Task {
            do {
                let fetchedTodos = try await APIService.shared.getTodos(accessToken: accessToken)
                await MainActor.run {
                    todos = fetchedTodos
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    print("❌ Failed to load todos: \(error)")
                }
            }
        }
    }
    
    private func markTodoComplete(_ todo: PatientTodo) async {
        guard let accessToken = KeychainManager.shared.getAccessToken() else { return }
        
        do {
            _ = try await APIService.shared.updateTodo(todoId: todo.id, status: "completed", accessToken: accessToken)
            loadTodos()
        } catch {
            print("❌ Failed to complete todo: \(error)")
        }
    }
}

// MARK: - Todo Item Row

struct TodoItemRow: View {
    let todo: PatientTodo
    let onTap: () -> Void
    let onComplete: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Priority indicator
                Circle()
                    .fill(priorityColor)
                    .frame(width: 8, height: 8)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(todo.title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    if let description = todo.description {
                        Text(description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                
                Spacer()
                
                // Action icon based on todo type
                if todo.todoType == "document_upload" {
                    Image(systemName: "arrow.up.doc.fill")
                        .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                } else {
                    Button(action: onComplete) {
                        Image(systemName: "circle")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    var priorityColor: Color {
        switch todo.priority {
        case "high": return .red
        case "medium": return .orange
        default: return .green
        }
    }
}

#Preview {
    PatientDashboardView()
        .environmentObject(AuthenticationManager())
        .environmentObject(AppState())
}