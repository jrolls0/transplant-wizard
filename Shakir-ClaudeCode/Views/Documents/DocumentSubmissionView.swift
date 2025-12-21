//
//  DocumentSubmissionView.swift
//  Transplant Platform - Patient Mobile App
//
//  Document upload view for submitting required documents
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct DocumentSubmissionView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    
    // Required documents checklist state
    @State private var uploadedDocuments: Set<DocumentType> = []
    @State private var isLoadingDocuments = true
    @State private var patientTodos: [PatientTodo] = []
    
    // Current upload state
    @State private var currentUploadType: DocumentType?
    @State private var frontImage: UIImage?
    @State private var backImage: UIImage?
    @State private var pdfData: Data?
    @State private var pdfFileName: String?
    @State private var isUploading = false
    @State private var uploadSuccess = false
    @State private var errorMessage: String?
    @State private var showImagePicker = false
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var isSelectingFront = true
    @State private var showSourceActionSheet = false
    
    // For uploading other documents after required ones are done
    @State private var selectedDocumentType: DocumentType = .other
    @State private var showOtherDocumentUpload = false
    @State private var additionalUploadedDocs: [(type: DocumentType, date: Date)] = []
    @State private var showAdditionalUploadSuccess = false
    
    private let requiredDocuments: [DocumentType] = [.insuranceCard, .medicationList, .governmentId]
    
    private var allRequiredUploaded: Bool {
        requiredDocuments.allSatisfy { uploadedDocuments.contains($0) }
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection
                    
                    if isLoadingDocuments {
                        ProgressView("Loading documents...")
                            .padding()
                    } else if !allRequiredUploaded {
                        // Required Documents Checklist
                        requiredDocumentsChecklist
                    } else {
                        // All required uploaded - show success and other upload option
                        allDocumentsUploadedSection
                    }
                    
                    Spacer(minLength: 40)
                }
            }
            .navigationTitle("Documents")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("Select Source", isPresented: $showSourceActionSheet) {
                Button("Take Photo") {
                    showCamera = true
                }
                Button("Choose from Library") {
                    showImagePicker = true
                }
                if currentUploadType != .insuranceCard {
                    Button("Select PDF") {
                        showFilePicker = true
                    }
                }
                Button("Cancel", role: .cancel) {
                    if !isUploading {
                        currentUploadType = nil
                    }
                }
            }
            .sheet(isPresented: $showImagePicker) {
                ImagePicker(image: isSelectingFront ? $frontImage : $backImage, sourceType: .photoLibrary)
            }
            .sheet(isPresented: $showCamera) {
                ImagePicker(image: isSelectingFront ? $frontImage : $backImage, sourceType: .camera)
            }
            .sheet(isPresented: $showFilePicker) {
                DocumentPicker(pdfData: $pdfData, fileName: $pdfFileName)
            }
        }
        .onAppear {
            loadUploadedDocuments()
        }
    }
    
    // MARK: - Header Section
    
    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: allRequiredUploaded ? "checkmark.circle.fill" : "doc.badge.plus")
                .font(.system(size: 50))
                .foregroundColor(allRequiredUploaded ? .green : Color(red: 0.2, green: 0.6, blue: 0.9))
            
            Text(allRequiredUploaded ? "All Documents Uploaded!" : "Upload Required Documents")
                .font(.title2)
                .fontWeight(.bold)
            
            Text(allRequiredUploaded ? 
                 "You can upload additional documents if needed" :
                 "Please upload the following documents to continue your referral")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding(.top)
    }
    
    // MARK: - Required Documents Checklist
    
    private var requiredDocumentsChecklist: some View {
        VStack(spacing: 16) {
            ForEach(requiredDocuments, id: \.self) { docType in
                RequiredDocumentRow(
                    documentType: docType,
                    isUploaded: uploadedDocuments.contains(docType),
                    isCurrentlyUploading: currentUploadType == docType && isUploading,
                    isActive: currentUploadType == docType,
                    onTap: {
                        if !uploadedDocuments.contains(docType) {
                            startUpload(for: docType)
                        }
                    }
                )
            }
            
            // Current Upload UI
            if let currentType = currentUploadType, !uploadedDocuments.contains(currentType) {
                currentUploadSection(for: currentType)
            }
            
            // Error Message
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal)
            }
        }
        .padding(.horizontal)
    }
    
    // MARK: - Current Upload Section
    
    private func currentUploadSection(for docType: DocumentType) -> some View {
        VStack(spacing: 16) {
            Divider()
            
            Text("Upload \(docType.displayName)")
                .font(.headline)
            
            if docType.requiresFrontBack {
                // Front and Back Upload for Insurance Card
                VStack(spacing: 12) {
                    DocumentImageUploadCard(
                        title: "Front Side",
                        image: frontImage,
                        onTap: {
                            isSelectingFront = true
                            showSourceActionSheet = true
                        },
                        onRemove: { frontImage = nil }
                    )
                    
                    DocumentImageUploadCard(
                        title: "Back Side",
                        image: backImage,
                        onTap: {
                            isSelectingFront = false
                            showSourceActionSheet = true
                        },
                        onRemove: { backImage = nil }
                    )
                }
            } else {
                // Single document upload
                if pdfData != nil {
                    // PDF Selected
                    HStack {
                        Image(systemName: "doc.fill")
                            .font(.title)
                            .foregroundColor(.red)
                        
                        VStack(alignment: .leading) {
                            Text(pdfFileName ?? "Document.pdf")
                                .font(.headline)
                            Text("PDF Document")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            pdfData = nil
                            pdfFileName = nil
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                } else {
                    DocumentImageUploadCard(
                        title: "Tap to add photo or PDF",
                        image: frontImage,
                        onTap: {
                            isSelectingFront = true
                            showSourceActionSheet = true
                        },
                        onRemove: { frontImage = nil }
                    )
                }
            }
            
            // Upload Button
            HStack(spacing: 12) {
                Button(action: {
                    currentUploadType = nil
                    clearSelections()
                }) {
                    Text("Cancel")
                        .fontWeight(.medium)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray5))
                        .foregroundColor(.primary)
                        .cornerRadius(12)
                }
                
                Button(action: { uploadDocument(type: docType) }) {
                    HStack {
                        if isUploading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Image(systemName: "arrow.up.circle.fill")
                            Text("Upload")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(
                        canUpload(for: docType) ?
                        Color(red: 0.2, green: 0.6, blue: 0.9) : Color.gray
                    )
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!canUpload(for: docType) || isUploading)
            }
        }
        .padding()
        .background(Color(.systemGray6).opacity(0.5))
        .cornerRadius(16)
    }
    
    // MARK: - All Documents Uploaded Section
    
    private var allDocumentsUploadedSection: some View {
        VStack(spacing: 20) {
            // Success checkmarks
            VStack(spacing: 12) {
                ForEach(requiredDocuments, id: \.self) { docType in
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text(docType.displayName)
                            .foregroundColor(.primary)
                        Spacer()
                        Text("Uploaded")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                    .padding()
                    .background(Color.green.opacity(0.1))
                    .cornerRadius(12)
                }
            }
            .padding(.horizontal)
            
            Divider()
                .padding(.vertical)
            
            // Upload Additional Documents
            VStack(spacing: 12) {
                Text("Upload Additional Documents")
                    .font(.headline)
                
                // Success message for additional uploads
                if showAdditionalUploadSuccess {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Document uploaded successfully!")
                            .fontWeight(.medium)
                            .foregroundColor(.green)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.green.opacity(0.1))
                    .cornerRadius(12)
                    .transition(.opacity.combined(with: .scale))
                }
                
                Menu {
                    ForEach(DocumentType.allCases.filter { !requiredDocuments.contains($0) }, id: \.self) { type in
                        Button(action: {
                            selectedDocumentType = type
                            showOtherDocumentUpload = true
                            currentUploadType = type
                        }) {
                            HStack {
                                Image(systemName: type.icon)
                                Text(type.displayName)
                            }
                        }
                    }
                } label: {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        Text("Select Document Type")
                            .foregroundColor(.primary)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                
                // Show previously uploaded additional documents
                if !additionalUploadedDocs.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Previously Uploaded")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.top, 8)
                        
                        ForEach(Array(additionalUploadedDocs.enumerated()), id: \.offset) { index, doc in
                            HStack {
                                Image(systemName: doc.type.icon)
                                    .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                                Text(doc.type.displayName)
                                    .foregroundColor(.primary)
                                Spacer()
                                Text(formatDate(doc.date))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(10)
                        }
                    }
                }
            }
            .padding(.horizontal)
            .animation(.easeInOut, value: showAdditionalUploadSuccess)
            
            // Show upload UI for additional docs
            if showOtherDocumentUpload, let currentType = currentUploadType {
                currentUploadSection(for: currentType)
                    .padding(.horizontal)
            }
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    
    // MARK: - Helper Methods
    
    private func startUpload(for docType: DocumentType) {
        currentUploadType = docType
        clearSelections()
        
        // Auto-show source action sheet
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isSelectingFront = true
            showSourceActionSheet = true
        }
    }
    
    private func canUpload(for docType: DocumentType) -> Bool {
        if docType.requiresFrontBack {
            return frontImage != nil && backImage != nil
        } else {
            return frontImage != nil || pdfData != nil
        }
    }
    
    private func clearSelections() {
        frontImage = nil
        backImage = nil
        pdfData = nil
        pdfFileName = nil
        uploadSuccess = false
        errorMessage = nil
    }
    
    private func loadUploadedDocuments() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else {
            isLoadingDocuments = false
            return
        }
        
        Task {
            do {
                // Load documents and todos in parallel
                async let documentsTask = APIService.shared.getDocuments(accessToken: accessToken)
                async let todosTask = APIService.shared.getTodos(accessToken: accessToken)
                
                let (documents, todos) = try await (documentsTask, todosTask)
                
                await MainActor.run {
                    // Mark document types that have been uploaded
                    for doc in documents {
                        if let docType = DocumentType(rawValue: doc.documentType) {
                            uploadedDocuments.insert(docType)
                        }
                    }
                    
                    // Store todos for marking complete later
                    patientTodos = todos
                    
                    isLoadingDocuments = false
                }
            } catch {
                await MainActor.run {
                    isLoadingDocuments = false
                    print("❌ Failed to load documents: \(error)")
                }
            }
        }
    }
    
    private func uploadDocument(type: DocumentType) {
        guard let accessToken = KeychainManager.shared.getAccessToken() else {
            errorMessage = "Authentication required"
            return
        }
        
        isUploading = true
        errorMessage = nil
        
        let isAdditionalDocument = !requiredDocuments.contains(type)
        
        Task {
            do {
                var files: [(Data, String, String)] = []
                
                if let front = frontImage, let data = front.jpegData(compressionQuality: 0.8) {
                    files.append((data, "front.jpg", "image/jpeg"))
                }
                
                if let back = backImage, let data = back.jpegData(compressionQuality: 0.8) {
                    files.append((data, "back.jpg", "image/jpeg"))
                }
                
                if let pdf = pdfData {
                    files.append((pdf, pdfFileName ?? "document.pdf", "application/pdf"))
                }
                
                try await APIService.shared.uploadDocument(
                    documentType: type.rawValue,
                    files: files,
                    accessToken: accessToken
                )
                
                // Mark corresponding todo as complete
                await markTodoComplete(for: type, accessToken: accessToken)
                
                await MainActor.run {
                    isUploading = false
                    uploadedDocuments.insert(type)
                    currentUploadType = nil
                    
                    if isAdditionalDocument {
                        // Track additional uploaded document and show success
                        additionalUploadedDocs.append((type: type, date: Date()))
                        showAdditionalUploadSuccess = true
                        // Hide success after 3 seconds
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            showAdditionalUploadSuccess = false
                        }
                    }
                    
                    showOtherDocumentUpload = false
                    clearSelections()
                }
                
            } catch {
                await MainActor.run {
                    isUploading = false
                    errorMessage = "Upload failed: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func markTodoComplete(for documentType: DocumentType, accessToken: String) async {
        // Find the todo that matches this document type
        let docTypeMapping: [DocumentType: String] = [
            .insuranceCard: "insurance_card",
            .medicationList: "medication_list",
            .governmentId: "government_id"
        ]
        
        guard let docTypeString = docTypeMapping[documentType] else { return }
        
        // Find matching todo by metadata
        if let matchingTodo = patientTodos.first(where: { todo in
            todo.todoType == "document_upload" && 
            todo.metadata?["documentType"] == docTypeString &&
            todo.status != "completed"
        }) {
            do {
                _ = try await APIService.shared.updateTodo(
                    todoId: matchingTodo.id,
                    status: "completed",
                    accessToken: accessToken
                )
                print("✅ Marked todo as complete: \(matchingTodo.title)")
            } catch {
                print("❌ Failed to mark todo as complete: \(error)")
            }
        }
    }
}

// MARK: - Required Document Row

struct RequiredDocumentRow: View {
    let documentType: DocumentType
    let isUploaded: Bool
    let isCurrentlyUploading: Bool
    let isActive: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Status Icon
                ZStack {
                    Circle()
                        .fill(isUploaded ? Color.green : (isActive ? Color(red: 0.2, green: 0.6, blue: 0.9) : Color(.systemGray4)))
                        .frame(width: 40, height: 40)
                    
                    if isCurrentlyUploading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else if isUploaded {
                        Image(systemName: "checkmark")
                            .foregroundColor(.white)
                            .fontWeight(.bold)
                    } else {
                        Image(systemName: documentType.icon)
                            .foregroundColor(.white)
                    }
                }
                
                // Document Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(documentType.displayName)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(isUploaded ? "Uploaded ✓" : (isActive ? "Uploading..." : "Tap to upload"))
                        .font(.caption)
                        .foregroundColor(isUploaded ? .green : .secondary)
                }
                
                Spacer()
                
                if !isUploaded && !isActive {
                    Image(systemName: "chevron.right")
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(
                isActive ? Color(red: 0.2, green: 0.6, blue: 0.9).opacity(0.1) :
                    (isUploaded ? Color.green.opacity(0.1) : Color(.systemGray6))
            )
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isActive ? Color(red: 0.2, green: 0.6, blue: 0.9) : Color.clear, lineWidth: 2)
            )
        }
        .disabled(isUploaded || isCurrentlyUploading)
    }
}

// MARK: - Document Type Enum

enum DocumentType: String, CaseIterable {
    case insuranceCard = "insurance_card"
    case medicationList = "medication_list"
    case governmentId = "government_id"
    case medicalRecords = "medical_records"
    case labResults = "lab_results"
    case referralLetter = "referral_letter"
    case other = "other"
    
    var displayName: String {
        switch self {
        case .insuranceCard: return "Insurance Card"
        case .medicationList: return "Medication Card/List"
        case .governmentId: return "Government-Issued ID"
        case .medicalRecords: return "Medical Records"
        case .labResults: return "Lab Results"
        case .referralLetter: return "Referral Letter"
        case .other: return "Other Document"
        }
    }
    
    var icon: String {
        switch self {
        case .insuranceCard: return "creditcard.fill"
        case .medicationList: return "pills.fill"
        case .governmentId: return "person.text.rectangle.fill"
        case .medicalRecords: return "doc.text.fill"
        case .labResults: return "chart.bar.doc.horizontal.fill"
        case .referralLetter: return "envelope.fill"
        case .other: return "doc.fill"
        }
    }
    
    var requiresFrontBack: Bool {
        self == .insuranceCard
    }
}

// MARK: - Document Image Upload Card

struct DocumentImageUploadCard: View {
    let title: String
    let image: UIImage?
    let onTap: () -> Void
    let onRemove: () -> Void
    
    var body: some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
            
            if let image = image {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 150)
                        .cornerRadius(12)
                    
                    Button(action: onRemove) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                    .padding(8)
                }
            } else {
                Button(action: onTap) {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 30))
                            .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        
                        Text("Tap to add photo")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 150)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [8]))
                            .foregroundColor(Color(.systemGray4))
                    )
                }
            }
        }
    }
}

// MARK: - Image Picker

struct ImagePicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    let sourceType: UIImagePickerController.SourceType
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = sourceType
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker
        
        init(_ parent: ImagePicker) {
            self.parent = parent
        }
        
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.image = image
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - Document Picker for PDFs

struct DocumentPicker: UIViewControllerRepresentable {
    @Binding var pdfData: Data?
    @Binding var fileName: String?
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.pdf])
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let parent: DocumentPicker
        
        init(_ parent: DocumentPicker) {
            self.parent = parent
        }
        
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            
            do {
                parent.pdfData = try Data(contentsOf: url)
                parent.fileName = url.lastPathComponent
            } catch {
                print("Error reading PDF: \(error)")
            }
            
            parent.dismiss()
        }
    }
}

#Preview {
    DocumentSubmissionView()
        .environmentObject(AuthenticationManager())
}
