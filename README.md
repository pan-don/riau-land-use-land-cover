# riau-land-use-land-cover

## Tabel Evaluasi Metrik — Perbandingan Model Klasifikasi

### Ringkasan Kinerja Keseluruhan

| Model | Akurasi | Kappa |
|---|---|---|
| CART | 0.9549 (95.49%) | 0.9484 |
| Random Forest | 0.9915 (99.15%) | 0.9903 |
| Gradient Boosting | 0.9919 (99.19%) | 0.9907 |

### Detail Per Kelas — CART

| Kelas | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| Mangrove | 0.9413 | 0.9625 | 0.9518 | 400 |
| Palm Oil | 0.9549 | 0.9160 | 0.9351 | 393 |
| Scrub | 0.9229 | 0.9576 | 0.9400 | 425 |
| Wetland | 0.8855 | 0.9431 | 0.9134 | 369 |
| Bare Land | 0.9629 | 0.9190 | 0.9404 | 395 |
| Water | 1.0000 | 1.0000 | 1.0000 | 409 |
| Built-Up | 0.9744 | 0.9383 | 0.9560 | 405 |
| Forest | 1.0000 | 1.0000 | 1.0000 | 396 |
| **Macro Avg** | **0.9552** | **0.9546** | **0.9546** | 3192 |
| **Weighted Avg** | **0.9557** | **0.9549** | **0.9550** | 3192 |

### Detail Per Kelas — Random Forest

| Kelas | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| Mangrove | 0.9876 | 0.9925 | 0.9900 | 400 |
| Palm Oil | 0.9871 | 0.9720 | 0.9795 | 393 |
| Scrub | 0.9929 | 0.9906 | 0.9918 | 425 |
| Wetland | 0.9733 | 0.9892 | 0.9812 | 369 |
| Bare Land | 0.9949 | 0.9949 | 0.9949 | 395 |
| Water | 1.0000 | 1.0000 | 1.0000 | 409 |
| Built-Up | 0.9950 | 0.9926 | 0.9938 | 405 |
| Forest | 1.0000 | 1.0000 | 1.0000 | 396 |
| **Macro Avg** | **0.9914** | **0.9915** | **0.9914** | 3192 |
| **Weighted Avg** | **0.9916** | **0.9915** | **0.9915** | 3192 |

### Detail Per Kelas — Gradient Boosting

| Kelas | Precision | Recall | F1-Score | Support |
|---|---|---|---|---|
| Mangrove | 0.9900 | 0.9900 | 0.9900 | 400 |
| Palm Oil | 0.9772 | 0.9822 | 0.9797 | 393 |
| Scrub | 0.9883 | 0.9906 | 0.9894 | 425 |
| Wetland | 0.9864 | 0.9837 | 0.9851 | 369 |
| Bare Land | 0.9949 | 0.9924 | 0.9937 | 395 |
| Water | 1.0000 | 1.0000 | 1.0000 | 409 |
| Built-Up | 0.9975 | 0.9951 | 0.9963 | 405 |
| Forest | 1.0000 | 1.0000 | 1.0000 | 396 |
| **Macro Avg** | **0.9918** | **0.9917** | **0.9918** | 3192 |
| **Weighted Avg** | **0.9919** | **0.9919** | **0.9919** | 3192 |

### Catatan Singkat
Random Forest dan Gradient Boosting jauh mengungguli CART dengan margin sekitar 4 poin akurasi, sementara selisih keduanya tipis (0.0003). Kelas Water dan Forest sempurna (precision/recall/f1 = 1.0) di ketiga model, sedangkan kelas Wetland dan Palm Oil paling sering tertukar, terlihat dari nilai precision/recall yang relatif lebih rendah di semua model, terutama pada CART.