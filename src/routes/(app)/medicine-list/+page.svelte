<script lang="ts">
  import { onMount } from "svelte";
  import { getFirestore, doc, setDoc, collection, getDocs, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
  import { firebaseConfig } from "$lib/firebaseConfig";
  import { initializeApp, getApps, getApp } from "firebase/app";
  import { MinusOutline, PlusOutline } from 'flowbite-svelte-icons';
  import Swal from "sweetalert2";

  let isCollapsed = false;

  type Medicine = {
    id: string;
    name: string;
    quantity: number;
    description: string;
    imageUrl?: string;
  };

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  const firestore = getFirestore(app);

  let medicines: Medicine[] = [];
  let showPopup = false;
  let newMedicine = { name: "", quantity: 0, description: "", imageUrl: "" };
  let imageFile: File | null = null;
  let editPopup = false;
  let medicineToEdit: Medicine | null = null;

  async function fetchMedicines() {
  const medicinesCollection = collection(firestore, "medicines");
  const medicineSnapshot = await getDocs(medicinesCollection);

  medicines = medicineSnapshot.docs
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id, 
        name: data.name || "", 
        quantity: data.quantity ?? 0, 
        description: data.description || "", 
        imageUrl: data.imageUrl || "",
      } as Medicine;
    })
    .filter((medicine) => medicine.name && medicine.description); 
}

  onMount(fetchMedicines);

  function togglePopup() {
    showPopup = !showPopup;
  }


  function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input && input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();

    reader.onloadend = () => {
      if (medicineToEdit) {
        medicineToEdit.imageUrl = reader.result as string;
      }

      if (newMedicine) {
        newMedicine.imageUrl = reader.result as string;
      }
    };

    reader.readAsDataURL(file);
  }
}

async function addMedicine() {
  if (newMedicine.name && newMedicine.quantity > 0 && newMedicine.description) {
    try {
  
      Swal.fire({
        title: "Adding Medicine...",
        text: "Please wait while we save the details.",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onloadend = async () => {
          newMedicine.imageUrl = reader.result as string;

          const medicineName = newMedicine.name; 
          await saveMedicineToFirestore();

          Swal.close();
          showSuccessAlert(medicineName);
        };
      } else {
     
        const medicineName = newMedicine.name;
        await saveMedicineToFirestore();

        Swal.close();
        showSuccessAlert(medicineName);
      }
    } catch (error) {
      console.error("Error adding medicine: ", error);

      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to add the medicine. Please try again.",
      });
    }
  } else {

    Swal.fire({
      icon: "warning",
      title: "Invalid Input",
      text: "Please fill in all the required fields and ensure the quantity is greater than zero.",
    });
  }
}

function showSuccessAlert(medicineName: string) {
  Swal.fire({
    icon: "success",
    title: "Medicine Added",
    text: `${medicineName} has been successfully added to the inventory.`,
  });
}

async function saveMedicineToFirestore() {
  const medicineRef = doc(firestore, "medicines", newMedicine.name);
  await setDoc(medicineRef, newMedicine);

  await fetchMedicines();
  newMedicine = { name: "", quantity: 0, description: "", imageUrl: "" };
  imageFile = null;
  togglePopup();
}

  async function updateMedicineQuantity(medicine: Medicine, increment: boolean) {
    const medicineRef = doc(firestore, "medicines", medicine.name);
    let updatedQuantity = medicine.quantity;

    if (increment) {
      updatedQuantity++;
    } else {
      if (updatedQuantity > 0) updatedQuantity--;
    }

    try {
      await updateDoc(medicineRef, { quantity: updatedQuantity });

      medicines = medicines.map(m => (m.name === medicine.name ? { ...m, quantity: updatedQuantity } : m));
    } catch (error) {
      console.error("Error updating quantity: ", error);
    }
  }

function openEditPopup(medicine: Medicine) {
  medicineToEdit = { ...medicine }; 
  editPopup = true;
}

function closeEditPopup() {
  editPopup = false;
  medicineToEdit = null;
}

async function saveEditedMedicine() {
  if (!medicineToEdit) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No medicine selected for editing.",
    });
    return;
  }

  if (!medicineToEdit.name || !medicineToEdit.description || medicineToEdit.quantity === undefined) {
    Swal.fire({
      icon: "warning",
      title: "Invalid Input",
      text: "Please fill in all required fields.",
    });
    return;
  }

  try {
    Swal.fire({
      title: "Saving Changes...",
      text: "Please wait while we update the medicine details.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const medicineRef = doc(firestore, "medicines", medicineToEdit?.id); 

    const docSnapshot = await getDoc(medicineRef);
    if (!docSnapshot.exists()) {
      Swal.close(); 
      Swal.fire({
        icon: "error",
        title: "Error",
        text: `The medicine record for ${medicineToEdit?.name || "this medicine"} does not exist.`,
      });
      return;
    }

    await updateDoc(medicineRef, {
      name: medicineToEdit?.name,
      quantity: medicineToEdit?.quantity,
      description: medicineToEdit?.description,
      imageUrl: medicineToEdit?.imageUrl || "",
    });

    medicines = medicines.map(m =>
      m.id === medicineToEdit?.id ? { ...m, ...medicineToEdit } : m
    );

    Swal.close();
    Swal.fire({
      icon: "success",
      title: "Medicine Updated",
      text: `${medicineToEdit.name} has been successfully updated.`,
    });

    // Close the edit popup
    closeEditPopup();
  } catch (error) {
    console.error("Error saving edited medicine:", error);

    Swal.close();
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Failed to save changes. Please try again.",
    });
  }
}

async function deleteMedicine(medicine: Medicine) {
  if (!medicine.id) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Failed to delete the medicine. No ID was found.",
    });
    return;
  }

  try {
    const result = await Swal.fire({
      title: `Are you sure?`,
      text: `Do you want to delete the medicine: ${medicine.name}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) {
      return; 
    }

    const medicineRef = doc(firestore, "medicines", medicine.id);
    await deleteDoc(medicineRef);

    medicines = medicines.filter((m) => m.id !== medicine.id);

    // Show success alert
    Swal.fire({
      icon: "success",
      title: "Deleted!",
      text: `${medicine.name} has been deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting medicine: ", error);

    // Show error alert
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Failed to delete the medicine. Please try again.",
    });
  }
}


</script>


<style>

  .dashboard {
    display: flex;
    min-height: 100vh;
    color: #1f2937;
    background: transparent;
  }

  .container {
    flex-grow: 1;
    overflow-y: auto;
    padding: 2rem;
    margin: 0 auto;
    max-width: 1400px;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .container::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .page-header {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .page-title {
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1rem;
  }

  .add-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-weight: 600;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
  }

  .add-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.6);
  }

  .add-button:active {
    transform: translateY(0);
  }

  .medicines-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    margin-top: 2rem;
  }

  .medicine-card {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 20px;
    padding: 1.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .medicine-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .medicine-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  }

  .medicine-image {
    width: 100%;
    height: 200px;
    border-radius: 12px;
    object-fit: cover;
    margin-bottom: 1rem;
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  }

  .no-image {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 200px;
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
    border-radius: 12px;
    color: #6b7280;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  .medicine-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .medicine-description {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.5;
    margin-bottom: 1rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .medicine-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .quantity-badge {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn-edit {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
    padding: 0.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-edit:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-delete {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    border: none;
    padding: 0.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-delete:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  }

  .popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .popup-content {
    background: white;
    border-radius: 20px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(30px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }

  .popup-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    font-size: 1rem;
    transition: all 0.2s ease;
    background: #f9fafb;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: #667eea;
    background: white;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-textarea {
    resize: vertical;
    min-height: 100px;
  }

  .image-preview {
    margin-top: 1rem;
    max-height: 200px;
    max-width: 100%;
    border-radius: 12px;
    object-fit: cover;
    border: 2px solid #e5e7eb;
  }

  .popup-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }

  .btn-cancel {
    background: #f3f4f6;
    color: #374151;
    border: 2px solid #e5e7eb;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-cancel:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
  }

  .btn-confirm {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-confirm:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .edit-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 20px;
    padding: 2rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    z-index: 1050;
    animation: slideUp 0.3s ease;
  }

  .edit-popup-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .form-left,
  .form-right {
    display: flex;
    flex-direction: column;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .container {
      padding: 1rem;
    }

    .page-header {
      padding: 1.5rem;
    }

    .page-title {
      font-size: 2rem;
    }

    .medicines-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .edit-popup {
      width: 95%;
      padding: 1.5rem;
    }

    .edit-popup-content {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .popup-actions {
      flex-direction: column;
    }

    .btn-cancel,
    .btn-confirm {
      width: 100%;
    }
  }

  @media (max-width: 480px) {
    .page-title {
      font-size: 1.75rem;
    }

    .medicine-card {
      padding: 1rem;
    }

    .medicine-image,
    .no-image {
      height: 150px;
    }

    .edit-popup {
      width: 98%;
      padding: 1rem;
    }
  }
</style>

<div class="dashboard">
    <div class="container">
      <div class="page-header">
        <h1 class="page-title">Manage Medicines</h1>
        <button class="add-button" on:click={togglePopup}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Medicine
        </button>
      </div>

      <div class="medicines-grid">
        {#each medicines as medicine, index}
          <div class="medicine-card">
            <!-- Image Section -->
            <div class="medicine-image-container">
              {#if medicine.imageUrl}
                <img src={medicine.imageUrl} alt={medicine.name} class="medicine-image" />
              {:else}
                <div class="no-image">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21,15 16,10 5,21"></polyline>
                  </svg>
                  <span>No Image Available</span>
                </div>
              {/if}
            </div>
      
            <!-- Medicine Details -->
            <div class="medicine-content">
              <h2 class="medicine-name">{medicine.name}</h2>
              <p class="medicine-description">{medicine.description}</p>
            </div>
      
            <!-- Footer with Quantity and Actions -->
            <div class="medicine-footer">
              <div class="quantity-badge">
                {medicine.quantity} units
              </div>
              <div class="action-buttons">
                <button
                  class="btn-edit"
                  on:click={() => openEditPopup(medicine)}
                  aria-label="Edit {medicine.name}"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <button
                  class="btn-delete"
                  on:click={() => deleteMedicine(medicine)}
                  aria-label="Delete {medicine.name}"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3,6 5,6 21,6"></polyline>
                    <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
        
      {#if editPopup && medicineToEdit}
        <div class="edit-popup">
          <div class="edit-popup-content">
            <div class="form-left">
              <h2 class="popup-title">Edit Medicine</h2>
      
              <div class="form-group">
                <label for="edit-name" class="form-label">Medicine Name</label>
                <input
                  id="edit-name"
                  type="text"
                  bind:value={medicineToEdit.name}
                  class="form-input"
                  required
                />
              </div>
      
              <div class="form-group">
                <label for="edit-quantity" class="form-label">Quantity</label>
                <input
                  id="edit-quantity"
                  type="number"
                  bind:value={medicineToEdit.quantity}
                  class="form-input"
                  required
                />
              </div>
      
              <div class="form-group">
                <label for="edit-description" class="form-label">Description</label>
                <textarea
                  id="edit-description"
                  bind:value={medicineToEdit.description}
                  class="form-textarea"
                  rows="4"
                  required
                ></textarea>
              </div>
      
              <div class="popup-actions">
                <button class="btn-cancel" on:click={closeEditPopup}>Cancel</button>
                <button class="btn-confirm" on:click={saveEditedMedicine} disabled={!medicineToEdit}>
                  Save Changes
                </button>
              </div>
            </div>
      
            <div class="form-right">
              <div class="form-group">
                <label for="edit-image" class="form-label">Upload Image</label>
                <input
                  id="edit-image"
                  type="file"
                  accept="image/*"
                  on:change={handleImageUpload}
                  class="form-input"
                />
              </div>
              {#if medicineToEdit.imageUrl}
                <img src={medicineToEdit.imageUrl} alt="Preview" class="image-preview" />
              {/if}
            </div>
          </div>
        </div>
      {/if}
      
      {#if showPopup}
        <div class="popup">
          <div class="popup-content">
            <h2 class="popup-title">Add New Medicine</h2>
            
            <div class="form-group">
              <label for="name" class="form-label">Medicine Name</label>
              <input
                id="name"
                type="text"
                bind:value={newMedicine.name}
                class="form-input"
                placeholder="Enter medicine name"
              />
            </div>
            
            <div class="form-group">
              <label for="quantity" class="form-label">Quantity</label>
              <input
                id="quantity"
                type="number"
                bind:value={newMedicine.quantity}
                class="form-input"
                placeholder="Enter quantity"
                min="0"
              />
            </div>
            
            <div class="form-group">
              <label for="description" class="form-label">Description</label>
              <textarea
                id="description"
                bind:value={newMedicine.description}
                class="form-textarea"
                rows="4"
                placeholder="Enter medicine description"
              ></textarea>
            </div>
            
            <div class="form-group">
              <label for="image" class="form-label">Upload Image</label>
              <input
                id="image"
                type="file"
                accept="image/*"
                on:change={handleImageUpload}
                class="form-input"
              />
            </div>
            
            {#if newMedicine.imageUrl}
              <img src={newMedicine.imageUrl} alt="Preview of {newMedicine.name}" class="image-preview" />
            {/if}
            
            <div class="popup-actions">
              <button class="btn-cancel" on:click={togglePopup}>Cancel</button>
              <button class="btn-confirm" on:click={addMedicine}>Add Medicine</button>
            </div>
          </div>
        </div>
      {/if}
    </div>
</div>