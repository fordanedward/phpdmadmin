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


<!-- svelte-ignore css_unused_selector -->
<style>
 .container {
  flex-grow: 1; 
  overflow-y: auto;
  padding: 1rem;
  margin: 0 auto;
  max-width: 1200px;

  -ms-overflow-style: none;
  scrollbar-width: none;
}

.container::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
      .dashboard {
        display: flex;
        height: 100vh;
        overflow: hidden;
        color: #333;

    }

    .container {
  flex-grow: 1; 
  overflow-y: auto; 
  padding: 1rem;
  margin: 0 auto; 
  max-width: 1200px;
}

.popup {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.popup-content {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

    .add-button {
      background: linear-gradient(90deg, #172f85, #6681e2);
        color: rgb(255, 255, 255);
        font-weight: 550;
        padding: 0.5rem 1rem;
        border-radius: 0.3rem;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.582);
        display: flex;
        align-items: center;
        transition: background 0.3s ease, transform 0.2s ease;
        border: none;
        cursor: pointer;
        outline: none;
        margin-top: -2.2rem;
        margin-bottom: 1rem;
}

.add-button:hover {
  background: linear-gradient(90deg, #6681e2, #172f85);
        transform: translateY(2px);
      }



 
.grid {
    margin-top: 20px;
    display: grid;
    gap: 20px;
}
.bg-white {
    border: 1px solid #e0e0e0;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.bg-white:hover {
    
  background-color: #f5f5f5; 
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.658); 
    transform: scale(1.01); 
}

.controls button {
  
    border: none;
    cursor: pointer;
    padding: 8px;
    margin: 0 5px;
    
    
}
span {
    font-size: 1.1rem;
    font-weight: 500;
}

label {
    font-weight: bold;
    font-size: 1rem;
    margin-bottom: 5px;
}

input,
textarea {
    background-color: #f9f9fc;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px;
    font-size: 1rem;
    width: 100%;
}

input:focus,
textarea:focus {
    border-color: #4a90e2;
    outline: none;
    box-shadow: 0 0 4px rgba(74, 144, 226, 0.4);
}

.cancel-button {
    background-color: #f44336;
    color: #fff;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.cancel-button:hover {
    background-color: #c23628;
}
.confirm-button {
    background-color: #4caf50;
    color: #fff;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.confirm-button:hover {
    background-color: #3e8e41;
}

.image-preview {
    margin-top: 10px;
    max-height: 150px;
    max-width: 100%;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid #ddd;
}
    .container {
    padding: 1rem;
    margin: 0 auto; 
    max-width: 1200px; 
}
   
    @media (min-width: 640px) {
        .container {
            padding: 2rem;
        }
    }

    @media (min-width: 768px) {
     
    }

    @media (min-width: 1024px) {
        .popup-content {
            width: 600px; 
        }
    }
    .edit-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  width: 800px;
  max-width: 90%;
  max-height: 80vh; 
  overflow-y: auto; 
  z-index: 1050;
}

@media (max-width: 768px) {
  .edit-popup {
    width: 90%;
    padding: 15px;
    max-height: 90vh; 
  }
  .edit-popup-content {
    flex-direction: column;
    gap: 10px;
  }

  .edit-popup .form-left,
  .edit-popup .form-right {
    flex: none;
    width: 100%;
  }

  .edit-popup .image-preview {
    max-height: 150px;
  }

  .edit-popup .cancel-button,
  .edit-popup .confirm-button {
    width: 100%;
    padding: 10px;
    text-align: center;
  }
}
@media (max-width: 480px) {
  .edit-popup {
    width: 95%;
    padding: 10px;
  }

  .edit-popup .image-preview {
    max-height: 120px;
  }

  .edit-popup .cancel-button,
  .edit-popup .confirm-button {
    font-size: 14px;
    padding: 8px;
  }
}
.custom-margin-top {
    margin-top: -1.8rem; 
    margin-left: -1rem;
    padding-bottom: 1.5rem;
}

</style>

<div class="dashboard">
    <!-- Sidebar -->
 

    <div class="container">
      <h1 class="text-2xl font-semibold mb-4 margin-top:10px">Manage Medicines</h1>
      <button class="add-button" on:click={togglePopup} style="margin-top: 10px;">+Add Medicine</button>


        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each medicines as medicine, index}
            <div class="bg-white p-4 rounded-lg shadow-md flex flex-col justify-between h-full">
              <!-- Image Section -->
              <div class="w-full h-40 bg-gray-200 mb-4">
                {#if medicine.imageUrl}
                  <img src={medicine.imageUrl} alt={medicine.name} class="w-full h-full object-cover rounded" />
                {:else}
                  <div class="flex items-center justify-center w-full h-full bg-gray-100 text-gray-500">
                    No Image Available
                  </div>
                {/if}
              </div>
        
              <!-- Medicine Details -->
              <div class="flex-1">
                <h2 class="text-lg font-semibold">{medicine.name}</h2>
                <p class="text-gray-600 mb-4">{medicine.description}</p>
              </div>
        
              <!-- Quantity, Edit, and Delete Section -->
              <div class="flex justify-between items-center mt-4 border-t pt-3">
                <!-- Quantity -->
                <span class="text-sm font-medium text-gray-700">Quantity: {medicine.quantity}</span>
        
                <!-- Edit and Delete Buttons -->
                <!-- svelte-ignore a11y_consider_explicit_label -->
                <div class="flex gap-2">
                  <!-- svelte-ignore a11y_consider_explicit_label -->
                  <button
                    class="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 flex items-center gap-1"
                    on:click={() => openEditPopup(medicine)}
                  >
                    <i class="fas fa-edit"></i>
                  </button>
                  <button
                    class="px-3 py-1 text-sm text-white bg-red-500 rounded hover:bg-red-600 flex items-center gap-1"
                    on:click={() => deleteMedicine(medicine)}
                  >
                    <i class="fas fa-trash"></i> 
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
        
        {#if editPopup && medicineToEdit}
        <div class="edit-popup">
          <div class="edit-popup-content landscape-layout">
            <div class="form-left">
              <h2 class="text-xl font-semibold mb-4">Edit Medicine</h2>
      
              <label for="edit-name" class="block text-gray-700 mb-2">Medicine Name</label>
              <input
                id="edit-name"
                type="text"
                bind:value={medicineToEdit.name}
                class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                required
              />
      
              <label for="edit-quantity" class="block text-gray-700 mb-2">Quantity</label>
              <input
                id="edit-quantity"
                type="number"
                bind:value={medicineToEdit.quantity}
                class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                required
              />
      
              <label for="edit-description" class="block text-gray-700 mb-2">Description</label>
              <textarea
                id="edit-description"
                bind:value={medicineToEdit.description}
                class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                rows="4"
                required
              ></textarea>
      
              <div class="flex justify-between">
                <button class="cancel-button" on:click={closeEditPopup}>Cancel</button>
                <button class="confirm-button" on:click={saveEditedMedicine} disabled={!medicineToEdit}>
                  Save Changes
                </button>
              </div>
            </div>
      
            <div class="form-right">
              <label for="edit-image" class="block text-gray-700 mt-10">Upload Image</label>
              <input
                id="edit-image"
                type="file"
                accept="image/*"
                on:change={handleImageUpload}
                class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
              />
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
                    <h2 class="text-xl font-semibold mb-4">Add New Medicine</h2>
                    <label for="name" class="block text-gray-700 mb-2">Medicine Name</label>
                    <input
                        id="name"
                        type="text"
                        bind:value={newMedicine.name}
                        class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                    />
                    <label for="quantity" class="block text-gray-700 mb-2">Quantity</label>
                    <input
                        id="quantity"
                        type="number"
                        bind:value={newMedicine.quantity}
                        class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                    />
                    <label for="description" class="block text-gray-700 mb-2">Description</label>
                    <textarea
                        id="description"
                        bind:value={newMedicine.description}
                        class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                        rows="4"
                    ></textarea>
                    <label for="image" class="block text-gray-700 mb-2">Upload Image</label>
                    <input
                        id="image"
                        type="file"
                        accept="image/*"
                        on:change={handleImageUpload}
                        class="border border-gray-300 rounded px-3 py-2 mb-4 w-full"
                    />
                    {#if newMedicine.imageUrl}
                        <img src={newMedicine.imageUrl} alt="Preview of {newMedicine.name}" class="image-preview" />
                    {/if}
                    <div class="flex justify-between">
                        <button class="cancel-button" on:click={togglePopup}>Cancel</button>
                        <button class="confirm-button" on:click={addMedicine}>Add Medicine</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>